// node --test tests/logistics-v120-ack.test.js (uses the existing TypeScript dev dependency)
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(env) {
    const filename = path.join(__dirname, '../src/utils/ackUtils.ts');
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
        reportDiagnostics: true,
    });
    assert.deepEqual(source.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error), []);
    const api = {};
    vm.runInNewContext(source.outputText, {
        exports: api, process: {env},
        require(name) {
            if (name === '@ondc/automation-logger') return {default: {info() {}}};
            throw new Error('Unexpected runtime dependency: ' + name);
        },
    }, {filename, timeout: 1000});
    return api;
}

test('logistics 1.2.0 ACK excludes context and leaves the request unchanged', () => {
    const api = load({DOMAIN: 'nic2004:60232', VERSION: '1.2.0'});
    const body = {context: {domain: 'nic2004:60232', core_version: '1.2.0'}};
    const before = JSON.stringify(body);
    assert.equal(api.shouldAddContext(), false);
    assert.deepEqual(JSON.parse(JSON.stringify(api.setAckResponse(true, body))), {
        message: {ack: {status: 'ACK'}},
    });
    assert.equal(JSON.stringify(body), before);
});

test('logistics 1.2.0 NACK retains its error without response context', () => {
    const api = load({DOMAIN: 'nic2004:60232', VERSION: '1.2.0'});
    const response = api.setAckResponse(false, {context: {}}, 'Synthetic rejection', '65001');
    assert.deepEqual(JSON.parse(JSON.stringify(response)), {
        error: {code: '65001', message: 'Synthetic rejection'},
        message: {ack: {status: 'NACK'}},
    });
});

test('logistics 1.2.0 bad-request NACK excludes empty context', () => {
    const api = load({DOMAIN: 'nic2004:60232', VERSION: '1.2.0'});
    const response = api.setBadRequestNack('invalid input');
    assert.equal(Object.hasOwn(response, 'context'), false);
    assert.equal(response.message.ack.status, 'NACK');
    assert.equal(response.error.code, '10000');
    assert.match(response.error.message, /invalid input/);
});

for (const [env, expected] of [
    [{DOMAIN: 'ONDC:LOG10', VERSION: '1.2.5'}, true],
    [{DOMAIN: 'ONDC:RET10', VERSION: '1.2.0'}, true],
    [{DOMAIN: 'nic2004:60232', VERSION: '1.2.1'}, true],
    [{DOMAIN: 'nic2004:60232', VERSION: '2.0.0'}, false],
    [{DOMAIN: 'nic2004:60232', VERSION: ''}, false],
    [{DOMAIN: 'nic2004:60232'}, false],
    [{VERSION: '1.2.0'}, true],
]) {
    test(`other configuration ${JSON.stringify(env)} retains context=${expected}`, () => {
        const api = load(env);
        // Request data must not choose the service's configured response schema.
        const body = {context: {domain: 'nic2004:60232', core_version: '1.2.0'}};
        assert.equal(api.shouldAddContext(), expected);
        for (const ack of [true, false]) {
            const response = api.setAckResponse(ack, body, 'Synthetic error', '65001');
            assert.equal(Object.hasOwn(response, 'context'), expected);
            if (expected) assert.equal(response.context, body.context);
        }
        assert.equal(Object.hasOwn(api.setBadRequestNack(), 'context'), expected);
    });
}
