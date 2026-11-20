import { parser } from '../dist/index.es.js';
import { fileTests } from '@lezer/generator/dist/test';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

let caseDir = path.dirname(fileURLToPath(import.meta.url))
for (const file of fs.readdirSync(caseDir)) {
    if (!/\.txt$/.test(file)) continue;

    const name = /^[^.]*/.exec(file)[0];
    describe(name, () => {
        for (const { name, run } of fileTests(fs.readFileSync(path.join(caseDir, file), 'utf8'), file)) it(name, () => run(parser));
    });
}

// these metricsql cases are valid PromQL too, so they also parse without
// the dialect.
const alsoPromQL = new Set([
    'PromQL function in the MetricsQL dialect',
    'Rate without a window',
    'Label named or',
    'Metric named like a MetricsQL aggregation',
    'Empty label list after group_left',
]);

function hasError(tree) {
    let found = false;
    tree.iterate({
        enter: (node) => {
            if (node.type.isError) found = true;
        },
    });

    return found;
}

describe('metricsql without the dialect', () => {
    const content = fs.readFileSync(path.join(caseDir, 'metricsql.txt'), 'utf8');
    for (const { name, text } of fileTests(content, 'metricsql.txt')) {
        if (alsoPromQL.has(name.trim())) continue;

        it(name, () => expect(hasError(parser.parse(text))).toBe(true));
    }
});

// every query the official MetricsQL parser accepts in its own tests.
// sync-metricsql-tests.mjs refreshes the list from a metricsql release.
describe('metricsql official queries', () => {
    const metricsql = parser.configure({ dialect: 'metricsql' });
    const { queries } = JSON.parse(fs.readFileSync(path.join(caseDir, 'metricsql-official.json'), 'utf8'));

    it.each(queries)('%s', (query) => expect(hasError(metricsql.parse(query))).toBe(false));
});

// MetricsQL only adds to PromQL, so every valid PromQL case must stay valid
// with the dialect on. This catches a MetricsQL token that takes over new
// upstream syntax.
describe('promql cases with the metricsql dialect', () => {
    const metricsql = parser.configure({ dialect: 'metricsql' });
    const content = fs.readFileSync(path.join(caseDir, 'expression.txt'), 'utf8');
    for (const { name, text, expected } of fileTests(content, 'expression.txt')) {
        if (expected.includes('⚠')) continue;

        it(name, () => expect(hasError(metricsql.parse(text))).toBe(false));
    }
});

// the MetricsQL keywords must stay ordinary names in PromQL. If upstream
// makes one of them a PromQL keyword, the dialect must stop claiming it.
describe('metricsql keywords in promql', () => {
    const keywords = [
        'any', 'bottomk_avg', 'bottomk_last', 'bottomk_max', 'bottomk_median', 'bottomk_min',
        'distinct', 'geomean', 'histogram', 'mad', 'median', 'mode', 'outliers_iqr',
        'outliers_mad', 'outliersk', 'quantiles', 'share', 'sum2', 'topk_avg', 'topk_last',
        'topk_max', 'topk_median', 'topk_min', 'zscore', 'if', 'ifnot', 'default', 'with',
        'keep_metric_names', 'limit', 'prefix',
    ];

    it.each(keywords)('%s is a metric name', (keyword) => {
        expect(parser.parse(keyword).toString()).toBe('PromQL(VectorSelector(Identifier))');
    });
});

describe('metricsql highlighting', () => {
    const highlighter = tagHighlighter([
        { tag: tags.function(tags.variableName), class: 'function' },
        { tag: tags.operatorKeyword, class: 'aggregation' },
        { tag: tags.keyword, class: 'keyword' },
        { tag: tags.modifier, class: 'modifier' },
        { tag: tags.logicOperator, class: 'logic' },
        { tag: tags.variableName, class: 'variable' },
        { tag: tags.labelName, class: 'label' },
        { tag: tags.operator, class: 'operator' },
    ]);
    const metricsql = parser.configure({ dialect: 'metricsql' });

    function classes(query) {
        const res = {};
        highlightTree(metricsql.parse(query), highlighter, (from, to, cls) => {
            res[query.slice(from, to)] = cls;
        });

        return res;
    }

    it('styles MetricsQL functions like PromQL functions', () => {
        const res = classes('median_over_time(rate(foo[5m]))');
        expect(res['median_over_time']).toBe('function');
        expect(res['rate']).toBe('function');
    });

    it('styles MetricsQL aggregations like PromQL aggregations', () => {
        const res = classes('median(foo) + sum(foo)');
        expect(res['median']).toBe('aggregation');
        expect(res['sum']).toBe('aggregation');
    });

    it('styles the MetricsQL keywords', () => {
        const res = classes('WITH (f = {a="b"}) sum(foo{f}) limit 3 keep_metric_names if bar ifnot baz default 0');
        expect(res['WITH']).toBe('keyword');
        expect(res['limit']).toBe('modifier');
        expect(res['keep_metric_names']).toBe('modifier');
        expect(res['if']).toBe('logic');
        expect(res['ifnot']).toBe('logic');
        expect(res['default']).toBe('logic');
        expect(res['f']).toBe('variable');
    });

    it('styles names beyond PromQL, templates and joined strings', () => {
        const res = classes('WITH (w = 5m) 温度{label.name="a" + "b"}[w]');
        expect(res['温度']).toBe('variable');
        expect(res['label.name']).toBe('label');
        expect(res['+']).toBe('operator');
        expect(res['w']).toBe('variable');
    });

    it('styles prefix and or filters', () => {
        const res = classes('foo{a="b" or c="d"} * on(a) group_left prefix "x_" bar');
        expect(res['or']).toBe('logic');
        expect(res['prefix']).toBe('modifier');
    });
});
