#!/usr/bin/env node
// Copyright 2026 Oxynote
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Writes test/metricsql-official.json: every query that the official
// MetricsQL parser accepts in its own tests, at the given release tag. The
// metricsql dialect must parse each of them without an error.
//
//   node sync-metricsql-tests.mjs v0.87.6

import { writeFileSync } from "node:fs";

const tag = process.argv[2];
if (!tag) {
  console.error("usage: node sync-metricsql-tests.mjs <metricsql tag, e.g. v0.87.6>");
  process.exit(1);
}

const url = `https://raw.githubusercontent.com/VictoriaMetrics/metricsql/${tag}/parser_test.go`;
const res = await fetch(url);
if (!res.ok) {
  console.error(`cannot fetch ${url}: ${res.status}`);
  process.exit(1);
}

const src = await res.text();
const body = src.slice(src.indexOf("func TestParseSuccess"), src.indexOf("func TestParseError"));

// unquote decodes a Go interpreted string literal without its quotes.
function unquote(s) {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, e) => {
    if (e[0] === "x" || e[0] === "u") {
      return String.fromCharCode(parseInt(e.slice(1), 16));
    }

    return { n: "\n", t: "\t", r: "\r" }[e] ?? e;
  });
}

// readStrings reads the string literals passed as arguments from offset on,
// up to the closing parenthesis.
function readStrings(s, offset) {
  const res = [];
  let i = offset;
  for (;;) {
    while (/\s|,/.test(s[i])) {
      i++;
    }

    if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      res.push(s.slice(i + 1, end));
      i = end + 1;
    } else if (s[i] === '"') {
      let end = i + 1;
      while (s[end] !== '"') {
        end += s[end] === "\\" ? 2 : 1;
      }

      res.push(unquote(s.slice(i + 1, end)));
      i = end + 1;
    } else {
      return res;
    }
  }
}

// both arguments of another() are valid: the query and the form the
// parser prints it in.
const queries = [];
for (const m of body.matchAll(/\b(same|another)\(/g)) {
  for (const q of readStrings(body, m.index + m[0].length)) {
    if (!queries.includes(q)) {
      queries.push(q);
    }
  }
}

const out = {
  source: `https://github.com/VictoriaMetrics/metricsql/blob/${tag}/parser_test.go`,
  license: "Apache-2.0, Copyright 2019-2020 VictoriaMetrics, Inc.",
  queries: queries,
};
writeFileSync(new URL("./test/metricsql-official.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${queries.length} queries from metricsql ${tag}`);
