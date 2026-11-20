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

describe('metricsql highlighting', () => {
    const highlighter = tagHighlighter([
        { tag: tags.function(tags.variableName), class: 'function' },
        { tag: tags.operatorKeyword, class: 'aggregation' },
        { tag: tags.keyword, class: 'keyword' },
        { tag: tags.modifier, class: 'modifier' },
        { tag: tags.logicOperator, class: 'logic' },
        { tag: tags.variableName, class: 'variable' },
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

    it('styles prefix and or filters', () => {
        const res = classes('foo{a="b" or c="d"} * on(a) group_left prefix "x_" bar');
        expect(res['or']).toBe('logic');
        expect(res['prefix']).toBe('modifier');
    });
});
