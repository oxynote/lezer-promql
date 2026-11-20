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

import { styleTags, tags } from "@lezer/highlight";

// styles the metricsql dialect's nodes like their PromQL counterparts.
export const metricsqlHighlight = styleTags({
  ExtendedIdentifier: tags.variableName,
  ExtendedLabelName: tags.labelName,
  TemplateReference: tags.variableName,
  CallIdentifier: tags.function(tags.variableName),
  "Any BottomkAvg BottomkLast BottomkMax BottomkMedian BottomkMin Distinct Geomean Histogram Mad Median Mode OutliersIQR OutliersMAD OutliersK Quantiles Share Sum2 TopkAvg TopkLast TopkMax TopkMedian TopkMin Zscore":
    tags.operatorKeyword,
  With: tags.keyword,
  "KeepMetricNames Limit Prefix": tags.modifier,
  "If IfNot Default OrFilter": tags.logicOperator,
  Concat: tags.operator,
});
