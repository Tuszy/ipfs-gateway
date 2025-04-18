const express = require("express");
const axios = require("axios");
const { pipeline } = require("stream");
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Your local IPFS API
const localNode = "http://ipfs";
const publicGateway = "https://ipfs.io";

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
        const cachedData = fs.readFileSync(cacheFilePath);
        const cachedContentType = fs.readFileSync(contentTypeFilePath, 'utf-8');
        res.set('Cache-Control', 'public, max-age=31557600');
        res.setHeader('Content-Type', cachedContentType);
        return res.send(cachedData);
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
        return pipeline(localStream.data, res, (err) => {
            if (err) console.error("Pipeline error (local):", err);
        });
    } catch (err) {
        console.log(`CID ${cid} not found locally. Fetching from public gateway...`, err.message);
    }

    // Not found locally — fetch from public gateway
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
    } catch (err) {
        console.error("Failed to fetch from public gateway:", err.message);
        res.status(500).send("Failed to fetch content.");
    }
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
