import { test as it, expect } from './fixtures';

const describe = it.describe;

/**
 * A WHERE predicate on an encrypted attribute is evaluated after decryption.
 *
 * The planner used to push it into the Mango selector like any other simple
 * predicate, where the index compared the literal against the ciphertext payload and
 * matched nothing - the in-memory re-check then had no row to check. The concept
 * page always said the predicate stayed in memory; this pins that it does, on the
 * base fetch, the streaming scan and a join's right side.
 */
describe("SQL over encrypted attributes", () => {
    it("matches a predicate on an encrypted attribute, in memory, on every fetch path", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const name = `crypto-predicate-${Date.now()}`;
            const stack = await ClientStack.create(`db-${name}`, { name, documentKey: "0".repeat(64) });
            const employee = await Class.create(stack, "Employee", "class", "Employees", {
                who: { name: "who", type: "string", config: { mandatory: true } },
                salary: { name: "salary", type: "string", config: { mandatory: true, encrypted: true } },
                dept: { name: "dept", type: "string", config: {} },
            });
            const department = await Class.create(stack, "Dept", "class", "Departments", {
                code: { name: "code", type: "string", config: { mandatory: true } },
                budget: { name: "budget", type: "string", config: { mandatory: true, encrypted: true } },
            });
            await department.addCards([{ code: "eng", budget: "big" }, { code: "ops", budget: "small" }]);
            await employee.addCards([
                { who: "alice", salary: "100", dept: "eng" },
                { who: "bob", salary: "200", dept: "ops" },
                { who: "cara", salary: "100", dept: "ops" },
            ]);
            const rows = async (sql: string, ...params: any[]) =>
                (await stack.query(sql, ...params)).rows.map((r: any) => r.who ?? r.code).sort();
            const streamed: string[] = [];
            for await (const row of stack.queryStream("SELECT who FROM Employee WHERE salary = '100'")) streamed.push(row.who);
            const out = {
                literal: await rows("SELECT who FROM Employee WHERE salary = '100'"),
                param: await rows("SELECT who FROM Employee WHERE salary = ?", "200"),
                mixed: await rows("SELECT who FROM Employee WHERE dept = 'ops' AND salary = '100'"),
                streamed: streamed.sort(),
                joinRight: await rows("SELECT e.who FROM Employee AS e JOIN Dept AS d ON d.code = e.dept WHERE d.budget = 'small'"),
            };
            stack.close();
            await stack.db.destroy();
            return out;
        });
        expect(result.literal).toEqual(["alice", "cara"]);
        expect(result.param).toEqual(["bob"]);
        expect(result.mixed).toEqual(["cara"]);
        expect(result.streamed).toEqual(["alice", "cara"]);
        expect(result.joinRight).toEqual(["bob", "cara"]);
    });

    it("projected reads of a scope-sealed attribute decrypt: the label travels with the projection", async ({ docStackPage }) => {
        const result = await docStackPage.evaluate(async () => {
            const { ClientStack, Class } = (window as any).docstack;
            const abe = (window as any).docstackAbe;
            const name = `crypto-projection-${Date.now()}`;
            const { pk, msk } = await abe.setup();
            const hrScope = await ClientStack.buildAccessScope({ scopeId: "hr", policyString: '"role:hr"', pk });
            const hrKey = await abe.keygen(msk, ["role:hr"]);
            const stack = await ClientStack.create(`db-${name}`, {
                name, documentKey: "0".repeat(64), accessKeys: { attributeKey: hrKey },
            });
            await stack.db.bulkDocs([hrScope]);
            await stack.unlockScopes(hrKey);
            const salary = await Class.create(stack, "Salary", "class", "Salaries", {
                who: { name: "who", type: "string", config: { mandatory: true } },
                amount: { name: "amount", type: "string", config: { mandatory: true, encrypted: true } },
            });
            await salary.addCard({ who: "alice", amount: "100000", "~scope": "hr" });
            const projected = (await salary.getCards({}, ["who", "amount"]))[0];
            const sql = (await stack.query("SELECT who, amount FROM Salary")).rows[0];
            const filtered = (await stack.query("SELECT who FROM Salary WHERE amount = ?", "100000")).rows;
            const streamed: any[] = [];
            for await (const row of stack.queryStream("SELECT who, amount FROM Salary")) streamed.push(row);
            const iterated: any[] = [];
            for await (const doc of stack.findDocumentsIterator({ "~class": "Salary" }, { fields: ["who", "amount"] })) iterated.push(doc);
            const withLabel = (await salary.getCards({}, ["who", "~scope"]))[0];
            stack.close();
            await stack.db.destroy();
            return {
                projectedAmount: projected?.amount, projectedHasLabel: "~scope" in (projected || {}),
                sql, filtered: filtered.length, streamed, iteratedAmount: iterated[0]?.amount,
                withLabel: withLabel?.["~scope"],
            };
        });
        expect(result.projectedAmount).toBe("100000");
        expect(result.projectedHasLabel).toBe(false);
        expect(result.sql).toEqual({ who: "alice", amount: "100000" });
        expect(result.filtered).toBe(1);
        expect(result.streamed).toEqual([{ who: "alice", amount: "100000" }]);
        expect(result.iteratedAmount).toBe("100000");
        expect(result.withLabel).toBe("hr");
    });
});
