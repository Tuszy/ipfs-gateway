const express = require("express");
const axios = require("axios");
const { pipeline } = require("stream");
const app = express();
const port = 3000;

// Your local IPFS API
const localNode = "http://ipfs";
const publicGateway = "https://ipfs.io";

const localGateway = axios.create({
    baseURL: localNode + ":8081",
    port: 8081
});

const localRpc = axios.create({
    baseURL: localNode + ":5001",
    port: 5001
});

app.get("/ipfs/:cid(*)", async (req, res) => {
    const cid = req.params.cid;

    // Check if the CID is available locally
    try {
        const localStream = await localGateway.get(`/ipfs/${cid}`, {
            responseType: "stream",
            redirect: "follow",
            signal: AbortSignal.timeout(2000)
        });

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
            responseType: "stream",
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LuksoHangout/1.0)'
            }
        });

        res.set(remoteStream.headers);
        return pipeline(remoteStream.data, res, (err) => {
            if (err) console.error("Pipeline error (remote):", err);
        });
    } catch (err) {
        console.error("Failed to fetch from public gateway:", err.message);
        res.status(500).send("Failed to fetch content.");
    }
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
