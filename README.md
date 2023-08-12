# Comparison of Redis and Pinecone Cosine Distance Metrics

## Contents
1.  [Summary](#summary)
2.  [Features](#features)
3.  [Prerequisites](#prerequisites)
4.  [Installation](#installation)
5.  [Usage](#usage)
6.  [Results](#results)

## Summary <a name="summary"></a>
This provides a comparison of the Redis VSS (JSON and Hashset types), Pinecone, and manual calcuation of cosine distance metrics.

## Features <a name="features"></a>
- Comparison implemented in Python (Jupyter notebook) 
- Comparison implemented in Nodejs
- Docker compose file to start up a Redis Stack instance.

## Prerequisites <a name="prerequisites"></a>
- Docker
- Python
- Jupyter
- Nodejs
- [OpenAI API key](https://platform.openai.com)
- [Pinecone API key](https://pinecone.io)

## Installation <a name="installation"></a>
1.  Clone this repo.
```bash 
    git clone https://github.com/Redislabs-Solution-Architects/vss-cosine.git && cd vss-cosine
```

2.  Create a .env file and add these lines:  
- OPENAI_API_KEY=yourKey
- PINECONE_API_KEY=yourKey
3.  Python 
- Follow notebook steps
4.  Nodejs
- Start up Redis Stack:  docker compose up -d
- Install the node module dependencies as listed in package.json:  npm install
- Execute the node app (cosine-comp.js) via script from the included package.json:  npm start

## Results <a name="results"></a>
### Python
 ```text
Redis cosine distance:    0.0696926
Pinecone cosine distance: 0.0664142
Manual cosine distance:   0.0696926

Redis v. Manual Delta:    0.0000001 
Pinecone v. Manual Delta: 0.0032784 
Redis v. Pinecone Delta:  0.0032783
 ```
 ### Nodejs
 ```text
*** Cosine Distances ***
Redis Hash:          0.0697387
Redis JSON:          0.0697387
Pinecone:            0.0663053
Manual:              0.0697387

*** Deltas ***
Redis/Manual:        0.0000000
Pinecone/Manual:     0.0034334
Redis/Pinecone:      0.0034334
 ```