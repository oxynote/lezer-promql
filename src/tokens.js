// Copyright The Prometheus Authors
// Modifications Copyright 2026 Oxynote
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

import {
  And,
  Avg,
  Atan2,
  Bool,
  Bottomk,
  By,
  Count,
  CountValues,
  Group,
  GroupLeft,
  GroupRight,
  Ignoring,
  inf,
  Max,
  Min,
  nan,
  Offset,
  On,
  Or,
  Quantile,
  LimitK,
  LimitRatio,
  StartFn,
  EndFn,
  Stddev,
  Stdvar,
  Sum,
  Topk,
  Unless,
  Without,
  AtEnd,
  AtStart,
  Smoothed,
  Anchored,
  Fill,
  FillLeft,
  FillRight,
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
  OrFilter,
  TemplateReference,
  Dialect_metricsql,
} from "./parser.terms.js";

const keywordTokens = {
  inf: inf,
  nan: nan,
  bool: Bool,
  ignoring: Ignoring,
  on: On,
  group_left: GroupLeft,
  group_right: GroupRight,
  offset: Offset,
};

export const specializeIdentifier = (value, stack) => {
  return keywordTokens[value.toLowerCase()] || -1;
};

const contextualKeywordTokens = {
  avg: Avg,
  atan2: Atan2,
  bottomk: Bottomk,
  count: Count,
  count_values: CountValues,
  group: Group,
  max: Max,
  min: Min,
  quantile: Quantile,
  limitk: LimitK,
  limit_ratio: LimitRatio,
  stddev: Stddev,
  stdvar: Stdvar,
  sum: Sum,
  topk: Topk,
  by: By,
  without: Without,
  and: And,
  or: Or,
  unless: Unless,
  smoothed: Smoothed,
  anchored: Anchored,
  fill: Fill,
  fill_left: FillLeft,
  fill_right: FillRight,
};

// keywords and aggregations that only MetricsQL has. They exist only
// while the metricsql dialect is on.
const metricsqlKeywordTokens = {
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

// metricsqlExtension returns the MetricsQL token for an identifier, or -1.
// Any name that is not a keyword may name a function, because MetricsQL
// has far more functions than PromQL and WITH defines its own. So it
// comes after the keywords, and it hides PromQL's function names too:
// rate( is a CallIdentifier in this dialect.
function metricsqlExtension(value, stack) {
  if (!stack.dialectEnabled(Dialect_metricsql)) {
    return -1;
  }

  const token = metricsqlKeywordTokens[value.toLowerCase()];
  if (token !== undefined && stack.canShift(token)) {
    return token;
  }

  if (stack.canShift(CallIdentifier)) {
    return CallIdentifier;
  }

  return -1;
}

export const extendIdentifier = (value, stack) => {
  if (value === "start" && stack.canShift(StartFn)) {
    return StartFn;
  }
  if (value === "end" && stack.canShift(EndFn)) {
    return EndFn;
  }
  if (value.toLowerCase() === "start" && stack.canShift(AtStart)) {
    return AtStart;
  }
  if (value.toLowerCase() === "end" && stack.canShift(AtEnd)) {
    return AtEnd;
  }

  const token = contextualKeywordTokens[value.toLowerCase()];
  if (token !== undefined && stack.canShift(token)) {
    return token;
  }

  return metricsqlExtension(value, stack);
};

// extendLabelName gives MetricsQL's label filter extras: or between two
// filter lists, and a bare name that a WITH binding defines, as in
// foo{commonFilters}.
export const extendLabelName = (value, stack) => {
  if (!stack.dialectEnabled(Dialect_metricsql)) {
    return -1;
  }

  if (value.toLowerCase() === "or" && stack.canShift(OrFilter)) {
    return OrFilter;
  }

  if (stack.canShift(TemplateReference)) {
    return TemplateReference;
  }

  return -1;
};
