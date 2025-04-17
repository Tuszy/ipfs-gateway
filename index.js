const express = require("express");
const axios = require("axios");
const { pipeline } = require("stream");
const app = express();
const port = 3000;

// Your local IPFS API
const localNode = "http://127.0.0.1";
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
        console.log(err.toString());
        console.log(`CID ${cid} not found locally. Fetching from public gateway...`);
    }

    // Not found locally — fetch from public gateway
    try {
        const remoteStream = await axios.get(`${publicGateway}/ipfs/${cid}`, {
            responseType: "stream",
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LuksoHangout/1.0)'
            }
        });

        // Pipe the remote stream to response and also add to local node
        const chunks = [];
        remoteStream.data.on("data", (chunk) => chunks.push(chunk));
        remoteStream.data.on("end", async () => {
            const fullBuffer = Buffer.concat(chunks);

            // Add to local node
            try {
                const form = new FormData();
                form.append('file', new Blob(fullBuffer), {
                    filename: cid // optional, but helps with file name
                });

                await localRpc.post(`/api/v0/add?pin=true`, form, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
                console.log(`CID ${cid} added to local node`);
            } catch (addErr) {
                console.error("Failed to add CID to local node:", addErr.message);
            }


            res.set(remoteStream.headers);
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
