const express = require("express");
const axios = require("axios");
const { pipeline } = require("stream");
const app = express();
const port = 3000;

// Your local IPFS API
const localNode = "http://ipfs:5001";
const publicGateway = "https://ipfs.io";

app.get("/ipfs/:cid(*)", async (req, res) => {
    const cid = req.params.cid;

    // Check if the CID is available locally
    try {
        await axios.post(`${localNode}/api/v0/ls?arg=${cid}`);
        // If successful, stream it from the local gateway
        const localStream = await axios.get(`${localNode}/ipfs/${cid}`, {
            responseType: "stream",
        });

        res.set(localStream.headers);
        return pipeline(localStream.data, res, (err) => {
            if (err) console.error("Pipeline error (local):", err);
        });
    } catch (err) {
        console.log(`CID ${cid} not found locally. Fetching from public gateway...`);
    }

    // Not found locally — fetch from public gateway
    try {
        const remoteStream = await axios.get(`${publicGateway}/ipfs/${cid}`, {
            responseType: "stream",
        });

        // Pipe the remote stream to response and also add to local node
        const chunks = [];
        remoteStream.data.on("data", (chunk) => chunks.push(chunk));
        remoteStream.data.on("end", async () => {
            const fullBuffer = Buffer.concat(chunks);

            // Add to local node
            try {
                await axios.post(`${localNode}/api/v0/add?pin=true`, fullBuffer, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                console.log(`CID ${cid} added to local node`);
            } catch (addErr) {
                console.error("Failed to add CID to local node:", addErr.message);
            }

            res.send(fullBuffer);
        });
    } catch (err) {
        console.error("Failed to fetch from public gateway:", err.message);
        res.status(500).send("Failed to fetch content.");
    }
});

app.listen(port, () => {
    console.log(`IPFS Proxy server listening at http://localhost:${port}`);
});
