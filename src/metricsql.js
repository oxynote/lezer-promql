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

// The tokens of the metricsql dialect. The rules for numbers, durations and
// names follow the lexer of https://github.com/VictoriaMetrics/metricsql
// (Copyright 2019-2020 VictoriaMetrics, Inc., Apache-2.0). Everything here
// does nothing while the dialect is off, so plain PromQL stays as strict as
// upstream.

import { ExternalTokenizer } from "@lezer/lr";
import {
  Any,
  BottomkAvg,
  BottomkLast,
  BottomkMax,
  BottomkMedian,
  BottomkMin,
  Distinct,
  Geomean,
  Histogram,
  Mad,
  Median,
  Mode,
  OutliersIQR,
  OutliersMAD,
  OutliersK,
  Quantiles,
  Share,
  Sum2,
  TopkAvg,
  TopkLast,
  TopkMax,
  TopkMedian,
  TopkMin,
  Zscore,
  If,
  IfNot,
  Default,
  With,
  KeepMetricNames,
  Limit,
  Prefix,
  CallIdentifier,
  Bool,
  Ignoring,
  On,
  GroupLeft,
  GroupRight,
  Offset,
  metricsqlNumber,
  ExtendedIdentifier,
  ExtendedLabelName,
  TemplateReference,
  OrFilter,
  AllLabels,
  Concat,
  emptyRange,
  stepOnlyWindow,
  emptyParens,
  atParen,
  tupleSeparator,
  trailingComma,
  Dialect_metricsql,
} from "./parser.terms.js";

// keywords and aggregations that only MetricsQL has.
const keywordTokens = {
  any: Any,
  bottomk_avg: BottomkAvg,
  bottomk_last: BottomkLast,
  bottomk_max: BottomkMax,
  bottomk_median: BottomkMedian,
  bottomk_min: BottomkMin,
  distinct: Distinct,
  geomean: Geomean,
  histogram: Histogram,
  mad: Mad,
  median: Median,
  mode: Mode,
  outliers_iqr: OutliersIQR,
  outliers_mad: OutliersMAD,
  outliersk: OutliersK,
  quantiles: Quantiles,
  share: Share,
  sum2: Sum2,
  topk_avg: TopkAvg,
  topk_last: TopkLast,
  topk_max: TopkMax,
  topk_median: TopkMedian,
  topk_min: TopkMin,
  zscore: Zscore,
  if: If,
  ifnot: IfNot,
  default: Default,
  with: With,
  keep_metric_names: KeepMetricNames,
  limit: Limit,
  prefix: Prefix,
};

// PromQL's reserved words. MetricsQL also takes them as metric names where
// the keyword cannot go, as in a + (on).
const reservedTokens = {
  bool: Bool,
  ignoring: Ignoring,
  on: On,
  group_left: GroupLeft,
  group_right: GroupRight,
  offset: Offset,
};

// extendMetricsqlIdentifier runs after PromQL's own keywords. Any name that
// is not a keyword may name a function, because MetricsQL has far more
// functions than PromQL and WITH defines its own. So rate( is a
// CallIdentifier in this dialect.
export const extendMetricsqlIdentifier = (value, stack) => {
  if (!stack.dialectEnabled(Dialect_metricsql)) {
    return -1;
  }

  const token = keywordTokens[value.toLowerCase()];
  if (token !== undefined && stack.canShift(token)) {
    return token;
  }

  if (stack.canShift(CallIdentifier)) {
    return CallIdentifier;
  }

  return -1;
};

const plainIdentifier = /^[A-Za-z_:][A-Za-z0-9_:]*$/;
const plainLabelName = /^[A-Za-z_][A-Za-z0-9_]*$/;
const durationUnits = "smhdwyi";

function isSpace(ch) {
  return ch === 32 || (ch >= 9 && ch <= 13);
}

function isDigit(ch) {
  return ch >= 48 && ch <= 57;
}

function isHexDigit(ch) {
  return isDigit(ch) || (ch >= 65 && ch <= 70) || (ch >= 97 && ch <= 102);
}

function lower(ch) {
  return ch >= 65 && ch <= 90 ? ch + 32 : ch;
}

// skipSpace returns the offset of the first character at or after offset
// that is not white space.
function skipSpace(input, offset) {
  while (isSpace(input.peek(offset))) {
    offset++;
  }

  return offset;
}

function isLetter(ch) {
  return ch >= 0 && /\p{L}/u.test(String.fromCodePoint(ch));
}

// escapeLength returns the length of the escape sequence that starts with
// the backslash at offset, or 0 when there is none: \xHH, \uHHHH, or a
// backslash before any printable character, space included.
function escapeLength(input, offset) {
  if (input.peek(offset) !== 92) {
    return 0;
  }

  const next = lower(input.peek(offset + 1));
  if (next === 120) {
    return isHexDigit(input.peek(offset + 2)) && isHexDigit(input.peek(offset + 3)) ? 4 : 0;
  }

  if (next === 117) {
    for (let i = 2; i < 6; i++) {
      if (!isHexDigit(input.peek(offset + i))) {
        return 0;
      }
    }

    return 6;
  }

  return next >= 32 && next !== 127 ? 2 : 0;
}

// scanName returns the length of the MetricsQL name at offset, or 0. A name
// may hold any letter, dots after its first character, and escapes.
function scanName(input, offset) {
  let i = offset;
  for (;;) {
    const ch = input.peek(i);
    const esc = escapeLength(input, i);
    if (esc > 0) {
      i += esc;
    } else if (isLetter(ch) || ch === 95 || ch === 58 || (i > offset && (isDigit(ch) || ch === 46))) {
      i += 1;
    } else {
      return i - offset;
    }
  }
}

function text(input, from, length) {
  let res = "";
  for (let i = from; i < from + length; i++) {
    res += String.fromCharCode(input.peek(i));
  }

  return res;
}

// scanDuration returns the length of the duration at offset, or 0. Its
// parts are a number, which may be fractional, and a unit, in any order
// and case. A lone M is a million, not minutes, and Mi and MB are byte
// sizes.
function scanDuration(input, offset) {
  let i = offset;
  for (;;) {
    let j = i;
    while (isDigit(input.peek(j))) {
      j++;
    }

    if (j === i) {
      return i - offset;
    }

    if (input.peek(j) === 46) {
      j++;
      while (isDigit(input.peek(j))) {
        j++;
      }
    }

    const unit = input.peek(j);
    if (lower(unit) === 109) {
      const next = lower(input.peek(j + 1));
      if (next === 115) {
        j += 2;
      } else if (unit === 109 && next !== 105 && next !== 98) {
        j += 1;
      } else {
        return i - offset;
      }
    } else if (unit >= 0 && durationUnits.includes(String.fromCharCode(lower(unit)))) {
      j += 1;
    } else {
      return i - offset;
    }

    i = j;
  }
}

// scanMultiplier returns the length of a size suffix such as K, Ki, KB or
// KiB at offset, in any case, or 0.
function scanMultiplier(input, offset) {
  if (!"kmgt".includes(String.fromCharCode(lower(input.peek(offset))))) {
    return 0;
  }

  let i = offset + 1;
  if (lower(input.peek(i)) === 105) {
    i++;
  }

  if (lower(input.peek(i)) === 98) {
    i++;
  }

  return i - offset;
}

// scanNumber returns the length of the number at offset, or 0: a decimal
// with underscores, a size suffix or an exponent, or a 0x, 0o or 0b
// integer.
function scanNumber(input, offset) {
  let i = offset;
  if (input.peek(i) === 48) {
    const base = lower(input.peek(i + 1));
    if (base === 120) {
      let j = i + 2;
      while (isHexDigit(input.peek(j))) {
        j++;
      }

      return j > i + 2 ? j - offset : 1;
    }

    if ((base === 111 || base === 98) && isDigit(input.peek(i + 2))) {
      i += 2;
    }
  }

  while (isDigit(input.peek(i)) || input.peek(i) === 95) {
    i++;
  }

  if (input.peek(i) === 46) {
    i++;
    while (isDigit(input.peek(i)) || input.peek(i) === 95) {
      i++;
    }
  }

  if (i === offset || (i === offset + 1 && input.peek(offset) === 46)) {
    return 0;
  }

  const multiplier = scanMultiplier(input, i);
  if (multiplier > 0) {
    return i + multiplier - offset;
  }

  if (lower(input.peek(i)) === 101) {
    let j = i + 1;
    if (input.peek(j) === 43 || input.peek(j) === 45) {
      j++;
    }

    const digits = j;
    while (isDigit(input.peek(j))) {
      j++;
    }

    if (j > digits) {
      return j - offset;
    }
  }

  return i - offset;
}

// isConcat tells whether the + at the input joins strings. It does when a
// string follows, or a name that is not a function call or a selector,
// as in "a" + x.
function isConcat(input) {
  const i = skipSpace(input, 1);
  const ch = input.peek(i);
  if (ch === 34 || ch === 39 || ch === 96) {
    return true;
  }

  const length = scanName(input, i);
  if (length === 0) {
    return false;
  }

  const next = input.peek(skipSpace(input, i + length));

  return next !== 40 && next !== 123;
}

function bracketToken(input, stack) {
  const i = skipSpace(input, 1);
  if (input.peek(i) === 93 && stack.canShift(emptyRange)) {
    input.acceptToken(emptyRange, i + 1);
  } else if (input.peek(i) === 58 && stack.canShift(stepOnlyWindow)) {
    input.acceptToken(stepOnlyWindow, i + 1);
  }
}

// parenToken handles the MetricsQL uses of (. Right after group_left or
// group_right, where (*) can go, () is an empty label list and not an
// empty tuple.
function parenToken(input, stack) {
  const i = skipSpace(input, 1);
  const afterJoin = stack.canShift(AllLabels);
  if (input.peek(i) === 42 && afterJoin) {
    const close = skipSpace(input, i + 1);
    if (input.peek(close) === 41) {
      input.acceptToken(AllLabels, close + 1);
    }
  } else if (input.peek(i) === 41 && !afterJoin && stack.canShift(emptyParens)) {
    input.acceptToken(emptyParens, i + 1);
  } else if (stack.canShift(atParen)) {
    input.acceptToken(atParen, 1);
  }
}

function commaToken(input, stack) {
  if (input.peek(skipSpace(input, 1)) === 41 && stack.canShift(trailingComma)) {
    input.acceptToken(trailingComma, 1);
  } else if (stack.canShift(tupleSeparator)) {
    input.acceptToken(tupleSeparator, 1);
  }
}

function numberToken(input, stack) {
  if (!stack.canShift(metricsqlNumber)) {
    return;
  }

  const length = Math.max(scanDuration(input, 0), scanNumber(input, 0));
  if (length > 0) {
    input.acceptToken(metricsqlNumber, length);
  }
}

// nameToken handles the names PromQL's tokens cannot: WITH templates, or
// between label filters, and names with letters beyond ASCII, dots or
// escapes. A plain name is left to PromQL's tokens.
function nameToken(input, stack) {
  const length = scanName(input, 0);
  if (length === 0) {
    return;
  }

  const name = text(input, 0, length);
  const next = input.peek(skipSpace(input, length));

  if (name.toLowerCase() === "or" && stack.canShift(OrFilter)) {
    input.acceptToken(OrFilter, length);

    return;
  }

  // a template name stops at a colon, which starts a subquery step in
  // m[w:5m].
  if (stack.canShift(TemplateReference) && next !== 40 && next !== 61 && next !== 33) {
    const colon = name.indexOf(":");
    if (colon !== 0) {
      input.acceptToken(TemplateReference, colon > 0 ? colon : length);

      return;
    }
  }

  const reserved = reservedTokens[name.toLowerCase()];
  if (reserved !== undefined && !stack.canShift(reserved) && stack.canShift(ExtendedIdentifier)) {
    input.acceptToken(ExtendedIdentifier, length);

    return;
  }

  if (stack.canShift(ExtendedLabelName) && !plainLabelName.test(name)) {
    input.acceptToken(ExtendedLabelName, length);

    return;
  }

  if (plainIdentifier.test(name)) {
    return;
  }

  if (next === 40 && stack.canShift(CallIdentifier)) {
    input.acceptToken(CallIdentifier, length);
  } else if (stack.canShift(ExtendedIdentifier)) {
    input.acceptToken(ExtendedIdentifier, length);
  }
}

export const metricsqlTokens = new ExternalTokenizer(
  (input, stack) => {
    if (!stack.dialectEnabled(Dialect_metricsql)) {
      return;
    }

    const ch = input.next;
    if (ch === 91) {
      bracketToken(input, stack);
    } else if (ch === 40) {
      parenToken(input, stack);
    } else if (ch === 44) {
      commaToken(input, stack);
    } else if (ch === 43) {
      if (stack.canShift(Concat) && isConcat(input)) {
        input.acceptToken(Concat, 1);
      }
    } else if (isDigit(ch) || (ch === 46 && isDigit(input.peek(1)))) {
      numberToken(input, stack);
    } else {
      nameToken(input, stack);
    }
  },
  { contextual: true },
);
