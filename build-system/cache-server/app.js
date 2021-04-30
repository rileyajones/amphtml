/**
 * Copyright 2021 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const bodyParser = require('body-parser');
const express = require('express');
const header = require('connect-header');
const morgan = require('morgan');
const {createProxyMiddleware} = require('http-proxy-middleware');
const {getUrl, shutdownCache} = require('./routes/test-cache');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(morgan('dev'));

// Built binaries should be fetchable from other origins, i.e. Storybook.
app.use(header({'Access-Control-Allow-Origin': '*'}));

app.use('', getUrl);

let listener;

/**
 * Start cache server listening on specified port.
 * @param {number} port
 * @return {Promise<void>}
 */
function listen(port) {
  return new Promise((resolve) => {
    listener = app.listen(port, resolve);
  });
}

/**
 * Stop the cache server.
 */
function close() {
  listener.close();
  shutdownCache();
}

module.exports = {
  listen,
  close,
};
