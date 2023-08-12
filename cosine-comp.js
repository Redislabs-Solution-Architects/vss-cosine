/**
 * @fileoverview Comparison of Redis and Pinecone VSS cosine calcuations
 * 
 */

import { createClient, SchemaFieldTypes, VectorAlgorithms } from 'redis';
import * as dotenv from 'dotenv';
import { Configuration, OpenAIApi } from 'openai';
import { PineconeClient } from '@pinecone-database/pinecone';
import { dot } from 'mathjs';

/**
 * Creates a Redis client connection.
 * @returns {_RedisClientType}
 */
async function redisClient() {
    const client = createClient({url: 'redis://localhost:6379'});
    await client.connect();
    return client;
}

/**
 * Creates an OpenAI connection.
 * @returns {Promise<OpenAIApi>} 
 */
async function openaiClient() {
    const config = new Configuration({apiKey: process.env.OPENAI_API_KEY,});
    const client = new OpenAIApi(config);
    return client;
}

/**
 * Creates an Pinecone connection.
 * @returns {Promise<PineconeClient>} 
 */
async function pineconeClient() {
    const client = new PineconeClient()
    await client.init({
        environment: "gcp-starter",
        apiKey: process.env.PINECONE_API_KEY
    })
    return client;
}

/**
 * Submits text to OpenAI and returns its embedding (array of floats)
 * @param {OpenAIApi} openai
 * @param {string} text
 * @returns {Promise<float[]>}  
 */
async function getVector(openai, text) {
    const response = await openai.createEmbedding({
        model: 'text-embedding-ada-002',
        input: text
    });
    return response.data.data[0].embedding;
}

/**
 * Builds two different indices in Redis on vectors.   
 * One index is on  JSON objects; the other on hashsets.
 * Write a vector as json and hash.
 * @param {_RedisClientType} redis
 * @param {float[]} vec
 * @returns {Promise<void>}
 */
async function loadRedis(redis, vec) {
    await redis.flushDb();
    await redis.ft.create('idx-json', {
        '$.vector': {
            type: SchemaFieldTypes.VECTOR,
            AS: 'vector',
            ALGORITHM: VectorAlgorithms.FLAT,
            TYPE: 'FLOAT32',
            DIM: vec.length,
            DISTANCE_METRIC: 'COSINE'
        },
    }, { ON: 'JSON', PREFIX: 'doc-json:'});
    
    await redis.ft.create('idx-hash', {
        'vector': {
            type: SchemaFieldTypes.VECTOR,
            ALGORITHM: VectorAlgorithms.FLAT,
            TYPE: 'FLOAT32',
            DIM: vec.length,
            DISTANCE_METRIC: 'COSINE'
        },
    }, { ON: 'HASH', PREFIX: 'doc-hash:'});

    redis.json.set('doc-json:1', '$', { vector: vec });
    redis.hSet('doc-hash:1', { vector: Buffer.from(new Float32Array(vec).buffer) });
}

/**
 * Builds an index in Pinecone and loads a vector.  
 * @param {PineconeClient} pinecone
 * @param {float[]} vec
 * @returns {Promise<...>}
 */
async function loadPinecone(pinecone, vec) {
    const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
    try {
        await pinecone.deleteIndex({ indexName: 'test' });
        while ((await pinecone.listIndexes()).includes('test')) {
            await sleep(3000);
        }
    }
    catch (err) {};

    await pinecone.createIndex({
        createRequest: {
            name: 'test',
            dimension: vec.length,
            metric: 'cosine'
        }
    });

    let ready = (await pinecone.describeIndex({indexName:'test'})).status.ready
    while ( !ready ) {
        await sleep(3000);
        ready = (await pinecone.describeIndex({indexName:'test'})).status.ready
    }
    const pindex = pinecone.Index('test');
    await pindex.upsert({ upsertRequest: { vectors: [{ id: 'doc:1', values: vec }] }});

    let stats = await pindex.describeIndexStats({describeIndexStatsRequest:{}});
    while (stats.totalVectorCount < 1) {
        await sleep(3000);
        stats = await pindex.describeIndexStats({describeIndexStatsRequest:{}});
    }
    return pindex;
}

/**
 * Performs a VSS query on either JSON or Hash stored vectors
 * @param {_RedisClientType} redis
 * @param {float[]} vec
 * @param {string} type
 * @returns {Promise<float>}
 */
async function queryRedis(redis, vec, type) {
    let result;
    switch (type) {
        case 'hash': 
        result = await redis.ft.search('idx-hash', '*=>[KNN 1 @vector $query_vec AS dist]', {
                PARAMS: { query_vec: Buffer.from(new Float32Array(vec).buffer) },
                DIALECT: 2,
                RETURN: ['dist']
            });
        break;

        case 'json':
            result = await redis.ft.search('idx-json', '*=>[KNN 1 @vector $query_vec AS dist]', {
                PARAMS: { query_vec: Buffer.from(new Float32Array(vec).buffer) },
                DIALECT: 2,
                RETURN: ['dist']
            });
        break;

        default:
            throw Error('invalid index type');
    }
    return parseFloat(result.documents[0].value.dist);
}

/**
 * Performs a Pinecone VSS query
 * @param {PineconeClient} index
 * @param {float[]} vec
 * @returns {Promise<float>}
 */
async function queryPinecone(index, vec) {
    const result = await index.query({
        queryRequest: {
            topK: 1,
            vector: vec, 
            include_values: true
        }
    })
    return 1.0 - result.matches[0].score;   
}

/**
 * Main function that executes all the functions above.
 */
(async () => {
    dotenv.config();
    const redis = await redisClient();
    const openai = await openaiClient();   
    const pinecone = await pineconeClient();

    const text1 = "Embeddings are used in various NLP applications, such as text classification, sentiment analysis, machine translation, and question-answering systems."
    const vector1 = await getVector(openai, text1);
    await loadRedis(redis, vector1);
    const pindex = await loadPinecone(pinecone, vector1);

    const text2 = "Embeddings are used as input features for machine and deep learning models."
    const vector2 = await getVector(openai, text2);

    const redisHashDist = await queryRedis(redis, vector2, 'hash');
    const redisJsonDist = await queryRedis(redis, vector2, 'json');
    const pineconeDist = await queryPinecone(pindex, vector2);
    const manual = 1.0 - dot(vector1, vector2);

    console.log('*** Cosine Distances ***')
    console.log(`${'Redis Hash:'.padEnd(20)} ${redisHashDist.toFixed(7)}`);
    console.log(`${'Redis JSON:'.padEnd(20)} ${redisJsonDist.toFixed(7)}`);
    console.log(`${'Pinecone:'.padEnd(20)} ${pineconeDist.toFixed(7)}`);
    console.log(`${'Manual:'.padEnd(20)} ${manual.toFixed(7)}`)
    console.log('\n*** Deltas ***');
    console.log(`${'Redis/Manual:'.padEnd(20)} ${(Math.abs(redisJsonDist-manual)).toFixed(7)}`);
    console.log(`${'Pinecone/Manual:'.padEnd(20)} ${(Math.abs(pineconeDist-manual)).toFixed(7)}`);
    console.log(`${'Redis/Pinecone:'.padEnd(20)} ${(Math.abs(redisJsonDist-pineconeDist)).toFixed(7)}`);

    await redis.disconnect();
    await pinecone.deleteIndex({indexName: 'test'});
})();