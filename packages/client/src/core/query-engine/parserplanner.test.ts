
// @ts-nocheck
import { parse } from './parser.js';
import { createPlan } from './planner.js';

describe('SQL Parser and Planner', () => {

  it('should parse and plan a JOIN query correctly', () => {
    const sql = `
      SELECT
        m.title,
        m.year,
        a.name AS actor_name
      FROM Movie AS m
      JOIN Actor AS a ON a._id IN m.actors
      WHERE m.rating > 8.5
      ORDER BY m.year DESC
      LIMIT 10;
    `;
    const expectedAst = [
      {
        "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "title"}, "as": null}, {"expr": {"type": "column_ref", "table": "m", "column": "year"}, "as": null}, {"expr": {"type": "column_ref", "table": "a", "column": "name"}, "as": "actor_name"}],
        "from": [{"table": "Movie", "as": "m"}],
        "joins": [{"type": "INNER", "table": "Actor", "as": "a", "on": {"type": "binary_expr", "operator": "IN", "left": {"type": "column_ref", "table": "a", "column": "_id"}, "right": {"type": "column_ref", "table": "m", "column": "actors"}}}],
        "where": {"type": "binary_expr", "operator": ">", "left": {"type": "column_ref", "table": "m", "column": "rating"}, "right": {"type": "param", "value": "8.5"}},
        "groupBy": null, "having": null,
        "orderBy": [{"expr": {"type": "column_ref", "table": "m", "column": "year"}, "order": "DESC"}],
        "limit": 10
      }
    ];
    
    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.type).toBe('select');
    expect(plan.fromTable.table).toBe('Movie');
    expect(plan.joins.length).toBe(1);
    expect(plan.joins[0].type).toBe('INNER');
    expect(plan.filters.left.length).toBe(1);
    expect(plan.orderBy[0].order).toBe('DESC');
    expect(plan.limit).toBe(10);
  });

  it('should parse and plan an aggregation query correctly', () => {
    const sql = `
      SELECT
        m.year,
        COUNT(*) as movie_count,
        AVG(m.rating) as avg_rating
      FROM Movie AS m
      GROUP BY m.year
      HAVING COUNT(*) > 1
      ORDER BY avg_rating DESC;
    `;
    
    const expectedAst = [
      {
        "type": "select", "distinct": false,
        "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "year"}, "as": null}, {"expr": {"type": "aggr_func", "name": "COUNT", "args": {"expr": {"type": "star"}, "distinct": false}}, "as": "movie_count"}, {"expr": {"type": "aggr_func", "name": "AVG", "args": {"expr": {"type": "column_ref", "table": "m", "column": "rating"}, "distinct": false}}, "as": "avg_rating"}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [], "where": null,
        "groupBy": {"type": "group_by", "columns": [{"type": "column_ref", "table": "m", "column": "year"}]},
        "having": {"type": "binary_expr", "operator": ">", "left": {"type": "aggr_func", "name": "COUNT", "args": {"expr": {"type": "star"}, "distinct": false}}, "right": {"type": "param", "value": "1"}},
        "orderBy": [{"expr": {"type": "column_ref", "table": null, "column": "avg_rating"}, "order": "DESC"}],
        "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.aggregation).not.toBeNull();
    expect(plan.aggregation.groupBy[0].column).toBe('year');
    expect(plan.aggregation.aggregates.length).toBe(2);
    expect(plan.aggregation.having.operator).toBe('>');
  });

  it('should parse and plan a scalar aggregation query correctly', () => {
    const sql = `SELECT AVG(m.rating) AS average_rating FROM Movie AS m;`;
    
    const expectedAst = [
      {
        "type": "select", "distinct": false,
        "columns": [{"expr": {"type": "aggr_func", "name": "AVG", "args": {"expr": {"type": "column_ref", "table": "m", "column": "rating"}, "distinct": false}}, "as": "average_rating"}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [], "where": null, "groupBy": null, "having": null, "orderBy": null, "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);
    
    const plan = createPlan(parsedAst);
    expect(plan.aggregation).not.toBeNull();
    expect(plan.aggregation.groupBy.length).toBe(0);
    expect(plan.aggregation.aggregates[0].expr.name).toBe('AVG');
  });

  it('should parse and plan a MIN/MAX query correctly', () => {
    const sql = `
      SELECT
        m.year,
        MIN(m.rating) AS min_rating,
        MAX(m.rating) AS max_rating,
        COUNT(*) AS movie_count
      FROM Movie AS m
      GROUP BY m.year
      HAVING MAX(m.rating) > 8.7
      ORDER BY m.year DESC;
    `;
    const expectedAst = [
      {
        "type": "select", "distinct": false,
        "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "year"}, "as": null}, {"expr": {"type": "aggr_func", "name": "MIN", "args": {"expr": {"type": "column_ref", "table": "m", "column": "rating"}, "distinct": false}}, "as": "min_rating"}, {"expr": {"type": "aggr_func", "name": "MAX", "args": {"expr": {"type": "column_ref", "table": "m", "column": "rating"}, "distinct": false}}, "as": "max_rating"}, {"expr": {"type": "aggr_func", "name": "COUNT", "args": {"expr": {"type": "star"}, "distinct": false}}, "as": "movie_count"}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [], "where": null,
        "groupBy": {"type": "group_by", "columns": [{"type": "column_ref", "table": "m", "column": "year"}]},
        "having": {"type": "binary_expr", "operator": ">", "left": {"type": "aggr_func", "name": "MAX", "args": {"expr": {"type": "column_ref", "table": "m", "column": "rating"}, "distinct": false}}, "right": {"type": "param", "value": "8.7"}},
        "orderBy": [{"expr": {"type": "column_ref", "table": "m", "column": "year"}, "order": "DESC"}],
        "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.aggregation).not.toBeNull();
    expect(plan.aggregation.aggregates.length).toBe(3);
    expect(plan.aggregation.having.left.name).toBe('MAX');
  });

  it('should parse and plan a DISTINCT query correctly', () => {
    const sql = `SELECT DISTINCT m.year FROM Movie AS m ORDER BY m.year;`;
    
    const expectedAst = [
      {
        "type": "select", "distinct": true,
        "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "year"}, "as": null}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [], "where": null, "groupBy": null, "having": null,
        "orderBy": [{"expr": {"type": "column_ref", "table": "m", "column": "year"}, "order": "ASC"}],
        "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.distinct).toBe(true);
  });

  it('should parse and plan an outer join query correctly', () => {
    const sql = `
      SELECT
        m.title,
        a.name AS actor_name
      FROM Movie AS m
      RIGHT JOIN Actor AS a ON a._id IN m.actors
      ORDER BY a.name;
    `;
    const expectedAst = [
      {
        "type": "select", "distinct": false,
        "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "title"}, "as": null}, {"expr": {"type": "column_ref", "table": "a", "column": "name"}, "as": "actor_name"}],
        "from": [{"table": "Movie", "as": "m"}],
        "joins": [{"type": "RIGHT", "table": "Actor", "as": "a", "on": {"type": "binary_expr", "operator": "IN", "left": {"type": "column_ref", "table": "a", "column": "_id"}, "right": {"type": "column_ref", "table": "m", "column": "actors"}}}],
        "where": null, "groupBy": null, "having": null,
        "orderBy": [{"expr": {"type": "column_ref", "table": "a", "column": "name"}, "order": "ASC"}],
        "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.joins.length).toBe(1);
    expect(plan.joins[0].type).toBe('RIGHT');
  });

  it('should parse and plan a UNION query correctly', () => {
    const sql = `
      SELECT m.title AS name FROM Movie AS m WHERE m.year < 2000
      UNION
      SELECT a.name FROM Actor AS a WHERE a.age > 60;
    `;
    const expectedAst = [
      {
        "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "title"}, "as": "name"}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [],
        "where": {"type": "binary_expr", "operator": "<", "left": {"type": "column_ref", "table": "m", "column": "year"}, "right": {"type": "param", "value": "2000"}},
        "groupBy": null, "having": null, "orderBy": null, "limit": null
      },
      { "type": "union", "distinct": true, "top": 0, "bottom": 2 },
      {
        "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": "a", "column": "name"}, "as": null}],
        "from": [{"table": "Actor", "as": "a"}], "joins": [],
        "where": {"type": "binary_expr", "operator": ">", "left": {"type": "column_ref", "table": "a", "column": "age"}, "right": {"type": "param", "value": "60"}},
        "groupBy": null, "having": null, "orderBy": null, "limit": null
      }
    ];
    
    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);
    
    const plan = createPlan(parsedAst);
    expect(plan.type).toBe('union');
    expect(plan.selectPlans.length).toBe(2);
    expect(plan.unionOps[0].distinct).toBe(true);
  });

  it('should parse and plan a UNION ALL query correctly', () => {
    const sql = `
      SELECT m.title FROM Movie AS m WHERE m.year = 1994
      UNION ALL
      SELECT m.title FROM Movie AS m WHERE m.year > 1993
    `;
    const expectedAst = [
      {
        "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "title"}, "as": null}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [],
        "where": {"type": "binary_expr", "operator": "=", "left": {"type": "column_ref", "table": "m", "column": "year"}, "right": {"type": "param", "value": "1994"}},
        "groupBy": null, "having": null, "orderBy": null, "limit": null
      },
      { "type": "union", "distinct": false, "top": 0, "bottom": 2 },
      {
        "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": "m", "column": "title"}, "as": null}],
        "from": [{"table": "Movie", "as": "m"}], "joins": [],
        "where": {"type": "binary_expr", "operator": ">", "left": {"type": "column_ref", "table": "m", "column": "year"}, "right": {"type": "param", "value": "1993"}},
        "groupBy": null, "having": null, "orderBy": null, "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.type).toBe('union');
    expect(plan.unionOps[0].distinct).toBe(false);
  });

  it('should support quoted identifiers with special characters', () => {
    const sql = `
      SELECT
        "~column",
        "t~"."$column1"
      FROM "~Table" AS "t~"
      WHERE "t~"."$column1" = 5;
    `;

    const expectedAst = [
      {
        "type": "select",
        "distinct": false,
        "columns": [
          { "expr": { "type": "column_ref", "table": null, "column": "~column" }, "as": null },
          { "expr": { "type": "column_ref", "table": "t~", "column": "$column1" }, "as": null }
        ],
        "from": [{ "table": "~Table", "as": "t~" }],
        "joins": [],
        "where": { "type": "binary_expr", "operator": "=", "left": { "type": "column_ref", "table": "t~", "column": "$column1" }, "right": { "type": "param", "value": "5" } },
        "groupBy": null,
        "having": null,
        "orderBy": null,
        "limit": null
      }
    ];

    const parsedAst = parse(sql);
    expect(parsedAst).toEqual(expectedAst);

    const plan = createPlan(parsedAst);
    expect(plan.fromTable.table).toBe('~Table');
    expect(plan.fromTable.as).toBe('t~');
    expect(plan.filters.left.length).toBe(1);
    expect(plan.filters.left[0].left.column).toBe('$column1');
  });

  describe('Subqueries', () => {
    it('should parse a NOT EXISTS subquery correctly', () => {
      const sql = `
        SELECT a.name FROM Actor AS a
        WHERE NOT EXISTS (
          SELECT 1 FROM Movie AS m
          WHERE m.year = 1994 AND a._id IN m.actors
        );
      `;
      const expectedAst = [
        {
          "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": "a", "column": "name"}, "as": null}],
          "from": [{"table": "Actor", "as": "a"}], "joins": [],
          "where": {
            "type": "exists_expr", "not": true,
            "subquery": {
              "type": "select", "distinct": false, "columns": [{"expr": {"type": "literal", "value": 1}, "as": null}],
              "from": [{"table": "Movie", "as": "m"}], "joins": [],
              "where": {
                "type": "and",
                "left": {"type": "binary_expr", "operator": "=", "left": {"type": "column_ref", "table": "m", "column": "year"}, "right": {"type": "param", "value": "1994"}},
                "right": {"type": "binary_expr", "operator": "IN", "left": {"type": "column_ref", "table": "a", "column": "_id"}, "right": {"type": "column_ref", "table": "m", "column": "actors"}}
              },
              "groupBy": null, "having": null, "orderBy": null, "limit": null
            }
          },
          "groupBy": null, "having": null, "orderBy": null, "limit": null
        }
      ];
      expect(parse(sql)).toEqual(expectedAst);
    });

    it('should plan a correlated NOT EXISTS subquery into an ANTI join', () => {
        const sql = `
            SELECT a.name FROM Actor AS a
            WHERE NOT EXISTS (
              SELECT 1 FROM Movie AS m
              WHERE m.year = 1994 AND a._id IN m.actors
            );
        `;
        const parsedAst = parse(sql);
        const plan = createPlan(parsedAst);

        expect(plan.joins.length).toBe(1);
        const join = plan.joins[0];
        expect(join.type).toBe('ANTI');
        expect(join.table).toBe('Movie');
        expect(join.on.operator).toBe('IN');
        expect(join.filters.length).toBe(1);
        expect(join.filters[0].operator).toBe('=');
    });

    it('should parse scalar subqueries in the WHERE clause correctly', () => {
      const sql = `
        SELECT title
        FROM Movie AS m
        WHERE (
          SELECT AVG(a.age)
          FROM Actor AS a
          WHERE a._id IN m.actors
        ) > (
          SELECT AVG(age)
          FROM Actor
        );
      `;
      const expectedAst = [
        {
          "type": "select", "distinct": false, "columns": [{"expr": {"type": "column_ref", "table": null, "column": "title"}, "as": null}],
          "from": [{"table": "Movie", "as": "m"}], "joins": [],
          "where": {
            "type": "binary_expr", "operator": ">",
            "left": {
              "type": "scalar_subquery",
              "ast": {
                "type": "select", "distinct": false, "columns": [{"expr": {"type": "aggr_func", "name": "AVG", "args": {"expr": {"type": "column_ref", "table": "a", "column": "age"}, "distinct": false}}, "as": null}],
                "from": [{"table": "Actor", "as": "a"}], "joins": [],
                "where": {"type": "binary_expr", "operator": "IN", "left": {"type": "column_ref", "table": "a", "column": "_id"}, "right": {"type": "column_ref", "table": "m", "column": "actors"}},
                "groupBy": null, "having": null, "orderBy": null, "limit": null
              }
            },
            "right": {
              "type": "scalar_subquery",
              "ast": {
                "type": "select", "distinct": false, "columns": [{"expr": {"type": "aggr_func", "name": "AVG", "args": {"expr": {"type": "column_ref", "table": null, "column": "age"}, "distinct": false}}, "as": null}],
                "from": [{"table": "Actor", "as": "Actor"}], "joins": [], "where": null, "groupBy": null, "having": null, "orderBy": null, "limit": null
              }
            }
          },
          "groupBy": null, "having": null, "orderBy": null, "limit": null
        }
      ];
      expect(parse(sql)).toEqual(expectedAst);
    });

     it('should plan a scalar subquery as a residual filter', () => {
      const sql = `
        SELECT title
        FROM Movie AS m
        WHERE (SELECT AVG(a.age) FROM Actor AS a WHERE a._id IN m.actors) > 50;
      `;
      const parsedAst = parse(sql);
      const plan = createPlan(parsedAst);

      expect(plan.filters.left.length).toBe(0);
      expect(plan.filters.residual.length).toBe(1);
      const residual = plan.filters.residual[0];
      expect(residual.type).toBe('binary_expr');
      expect(residual.operator).toBe('>');
      expect(residual.left.type).toBe('scalar_subquery');
    });
  });
});