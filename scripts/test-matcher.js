const assert = require("assert");
const m = require("../out/matcher");

assert.strictEqual(m.normalizeRule("bgioneco-upms/**"), "bgioneco-upms");
assert.strictEqual(m.normalizeRule("**/application.yml"), "application.yml");
assert.strictEqual(m.normalizeRule("  ./foo/bar/  "), "foo/bar");

assert.ok(m.pathMatchesRule("bgioneco-upms/a/b.java", "bgioneco-upms"));
assert.ok(m.pathMatchesRule("x/bgioneco-upms/a.java", "bgioneco-upms"));
assert.ok(m.pathMatchesRule("bgioneco-upms", "bgioneco-upms"));
assert.ok(!m.pathMatchesRule("bgioneco-upms-biz/a.java", "bgioneco-upms"));
assert.ok(m.pathMatchesRule("bgioneco-auth/src/main/resources/application.yml", "application.yml"));
assert.ok(m.pathMatchesRule("application.yml", "application.yml"));
assert.ok(!m.pathMatchesRule("application.yaml", "application.yml"));
assert.ok(m.pathMatchesRule("a/b/c.yml", "a/b"));
assert.ok(!m.pathMatchesRule("a/bc/d.yml", "a/b"));
assert.ok(m.pathMatchesAny("bgioneco-gateway/src/x.java", ["bgioneco-upms", "bgioneco-gateway"]));
assert.ok(!m.pathMatchesAny("bgioneco-alarm-platform/x.java", ["bgioneco-upms", "bgioneco-gateway"]));

const u = m.uniqueRules(["bgioneco-upms/**", "bgioneco-upms", ""]);
assert.deepStrictEqual(u, ["bgioneco-upms"]);

console.log("matcher tests passed");
