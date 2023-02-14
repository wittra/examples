"use strict";

const fs = require("fs");
const express = require("express");

const app = express();

const port = 1234;

const timestamp = () => Math.floor(+new Date() / 1000);
const randomNumber = (min, max) =>
  Math.floor(Math.random() * (max - min + 1) + min);

app.use(express.json());

app.post("/", (req, res) => {
  const postData = req.body;
  const deviceId = postData.deviceId;
  var today = new Date();
  var time =
    today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();

  if (/^(D[A-F0-9]{16})|(G[A-F0-9]{18})|(M[A-F0-9]{16})$/.test(deviceId)) {
    console.log("--------------------------------------------------");
    console.log(time);
    console.log("Saving data from device " + deviceId);

    const folder = "data/" + deviceId;
    const file =
      folder + "/" + timestamp() + "_" + randomNumber(10000, 99999) + ".json";

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(postData, null, 4));
  }

  res.end();
});

app.listen(port);
