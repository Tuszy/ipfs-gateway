const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;
app.use(cors());

// Your local IPFS API
const localNode = "http://ipfs";
const publicGateways = ["https://api.universalprofile.cloud", "https://ipfs.io", "https://gateway.pinata.cloud"];

const localGateway = axios.create({
    baseURL: localNode + ":8080",
    port: 8080
});

const cacheDir = path.join(__dirname, 'cache');

if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir); // Create the cache directory if it doesn't exist
}

const getCacheFilePath = (cidPath) => {
    return path.join(cacheDir, `${cidPath.replace(/\//g, '_')}.cache`);
};

const getContentTypeFilePath = (cidPath) => {
    return path.join(cacheDir, `${cidPath.replace(/\//g, '_')}.content-type`);
};


app.get("/ipfs/:cid(*)", async (req, res) => {
    const cid = req.params.cid;

    const cacheFilePath = getCacheFilePath(cid);
    const contentTypeFilePath = getContentTypeFilePath(cid);

    // Check if the file exists in the cache
    if (fs.existsSync(cacheFilePath) && fs.existsSync(contentTypeFilePath)) {
        console.log('Cache hit');

        const cachedContentType = fs.readFileSync(contentTypeFilePath, 'utf-8');
        res.set('Cache-Control', 'public, max-age=31557600');
        res.setHeader('Content-Type', cachedContentType);

        const stream = fs.createReadStream(cacheFilePath);
        return stream.pipe(res);
    }

    // Check if the CID is available locally
    try {
        const localStream = await localGateway.get(`/ipfs/${cid}`, {
            responseType: "stream",
            redirect: "follow",
            signal: AbortSignal.timeout(5000)
        });

        localStream.headers["Cache-Control"] = 'public, max-age=31557600';
        res.set(localStream.headers);
        localStream.pipe(res);
    } catch (err) {
        console.log(`CID ${cid} not found locally. Fetching from public gateway...`, err.message);
    }

    for (const publicGateway of publicGateways) {
        try {
            const remoteStream = await axios.get(`${publicGateway}/ipfs/${cid}`, {
                responseType: "arraybuffer",
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; LuksoHangout/1.0)'
                }
            });

            fs.writeFileSync(cacheFilePath, remoteStream.data); // Save to cache file
            fs.writeFileSync(contentTypeFilePath, remoteStream.headers['content-type']); // Save Content-Type

            remoteStream.headers["Cache-Control"] = 'public, max-age=31557600';
            res.set(remoteStream.headers);
            res.send(remoteStream.data);
            return;
        } catch (err) {
            console.error("Failed to fetch from public gateway:", `${publicGateway}/ipfs/${cid}`, err.message);
        }
    }

    res.status(500).send("Failed to fetch content.");
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
