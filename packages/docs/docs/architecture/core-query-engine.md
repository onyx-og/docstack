# Query Engine

```typescript
// Example: Find all movies rated above 8.5 and the names of their actors.
const sql = `
  SELECT
    m.title,
    m.year,
    a.name AS actor_name
  FROM Movie AS m
  JOIN Actor AS a ON a._id IN m.actors
  WHERE m.rating > 8.5
  ORDER BY m.year DESC;
`;

const { rows } = await stack.query(sql);
// rows might look like:
// [{ title: 'The Dark Knight', year: 2008, actor_name: 'Christian Bale' }, ...]
```

## Overview (For Business Analysts)

### What is the Query Engine?
The DocStack Query Engine is a powerful tool that allows you to "ask questions" of your data using a familiar SQL-like syntax. Instead of writing complex code to filter and combine data, you can write simple, declarative queries to retrieve exactly the information you need. It acts as a universal translator, converting human-readable questions into a format the database can understand and execute efficiently.

### Why use the Query Engine?
The Query Engine provides significant business value by making data more accessible and analysis more powerful.

*   **Democratized Data Access**: Business analysts, data scientists, and even less-technical users can directly query the database without needing to understand the underlying programming APIs. This empowers teams to get the answers they need, faster.
*   **Powerful Reporting and Analytics**: Easily generate complex reports that join data from multiple sources. For example, you can find all customers who purchased a specific product and live in a certain region with a single query.
*   **Rapid Prototyping**: Developers can quickly build data-driven features by writing a simple query instead of complex data-fetching logic.
*   **Consistency and Reliability**: Queries are executed in a predictable and optimized way, ensuring that results are always consistent and performance is maximized.

### Common Business Use Cases:
*   **Sales Reporting**: "Show me the total sales for each product category in the last quarter."
*   **Customer Segmentation**: "Find all customers who have spent over $1,000 and haven't made a purchase in the last 90 days."
*   **Inventory Management**: "List all products with fewer than 10 items in stock, joined with their supplier information."
*   **Content Analysis**: "Count how many articles were published each month and calculate their average rating."

## Guide: Querying for Movies and Actors

This guide walks you through using the `stack.query()` method to retrieve data.

### Step 1: A Basic Query
Let's start by selecting all movies released in the year 1994. The `stack.query()` method takes a SQL string and returns a promise that resolves to an object containing the `rows`.

```typescript
const sql = "SELECT title, rating FROM Movie WHERE year = 1994 ORDER BY rating DESC;";

const { rows } = await stack.query(sql);

console.log(rows);
// Expected output:
// [
//   { title: 'The Shawshank Redemption', rating: 9.3 },
//   { title: 'Pulp Fiction', rating: 8.9 },
//   ...
// ]
```

### Step 2: A Query with a JOIN
Now, let's do something more complex. We want to find movies and list the actors in them. In DocStack, a `Movie` document might have an `actors` field containing an array of actor IDs. We can use a `JOIN` to connect `Movie` documents to `Actor` documents.

```typescript
const sql = `
  SELECT
    m.title,
    a.name AS actor_name
  FROM Movie AS m
  JOIN Actor AS a ON a._id IN m.actors
  WHERE m.title = 'Pulp Fiction';
`;

const { rows } = await stack.query(sql);

console.log(rows);
// Expected output:
// [
//   { title: 'Pulp Fiction', actor_name: 'John Travolta' },
//   { title: 'Pulp Fiction', actor_name: 'Samuel L. Jackson' },
//   ...
// ]
```

### Step 3: An Aggregation Query
The engine also supports aggregation for summarizing data. Let's count the number of movies released each year and find the average rating for that year.

```typescript
const sql = `
  SELECT
    year,
    COUNT(*) AS movie_count,
    AVG(rating) AS average_rating
  FROM Movie
  GROUP BY year
  ORDER BY year DESC;
`;

const { rows } = await stack.query(sql);

console.log(rows);
// Expected output:
// [
//   { year: 2023, movie_count: 150, average_rating: 6.8 },
//   { year: 2022, movie_count: 145, average_rating: 7.1 },
//   ...
// ]
```

## API Reference (For Developers)

The Query Engine is exposed via a single method on the `ClientStack` instance: `stack.query()`. It processes SQL through a three-stage pipeline: **Parse -> Plan -> Execute**.

### `stack.query(sql: string, ...params: any[])`

*   **`sql`**: A string containing the SQL-like query to execute.
*   **`params`**: Optional parameters for prepared statements (currently not implemented).
*   **Returns**: `Promise<{ rows: object[], ast: object }>`
    *   `rows`: An array of result objects.
    *   `ast`: The Abstract Syntax Tree generated from the SQL string, useful for debugging.

### Stage 1: Parser
The parser (`parse(sql)`) transforms the raw SQL string into an **Abstract Syntax Tree (AST)**. The AST is a structured, hierarchical representation of the query's components (e.g., columns, tables, conditions). This stage validates the SQL syntax and prepares it for planning.

### Stage 2: Planner
The planner (`createPlan(ast)`) takes the AST and converts it into an optimized **execution plan**. This is the most critical stage for performance. The planner analyzes the query and determines the most efficient way to fetch and process the data. Key optimizations include:

*   **Join Strategy**: Determines how to perform joins.
*   **Filter Pushdown**: Converts `WHERE` clauses into efficient database selectors (Mango queries) to fetch as little data as possible.
*   **Subquery Unnesting**: Converts correlated subqueries (like `NOT EXISTS`) into more efficient join types (like `ANTI JOIN`).
*   **Residual Filtering**: Identifies complex conditions that cannot be converted to a database selector and must be evaluated in memory after the initial data fetch.

### Stage 3: Executor
The executor (`executePlan(plan)`) takes the execution plan and runs it. This involves:

1.  Fetching initial data from the database using the selectors defined in the plan.
2.  Performing joins in memory based on the join strategy.
3.  Applying any residual filters that couldn't be pushed down to the database.
4.  Performing aggregations (`GROUP BY`, `COUNT`, `AVG`, etc.).
5.  Applying projections (`SELECT` columns and aliases).
6.  Sorting the results (`ORDER BY`).
7.  Applying `DISTINCT` if specified.
8.  Limiting the final result set (`LIMIT`).

### Supported SQL Features
The DocStack Query Engine supports a rich subset of standard SQL, including:

*   **Clauses**: `SELECT`, `FROM`, `WHERE`, `ORDER BY`, `LIMIT`, `GROUP BY`, `HAVING`
*   **Joins**: `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`
*   **Join Conditions**: `ON a._id IN m.actors` (for array relationships) and standard equality `ON a.field = b.field`.
*   **Aggregates**: `COUNT`, `AVG`, `SUM`, `MIN`, `MAX`
*   **Set Operations**: `UNION`, `UNION ALL`
*   **Distinct**: `SELECT DISTINCT`
*   **Subqueries**:
    *   `EXISTS` and `NOT EXISTS` (planned as efficient `SEMI` and `ANTI` joins).
    *   Scalar subqueries in `WHERE` clauses (e.g., `WHERE (SELECT AVG(age) FROM ...) > 50`).
*   **Identifiers**: Standard identifiers, aliases (`AS`), and quoted identifiers for special characters (e.g., `SELECT "~field" FROM "~Table"`).

### Security and Encryption Integration
The Query Engine is fully integrated with the **Policy Engine** and **Crypto Engine**, ensuring that data security is always enforced.

*   **Policy Enforcement**: When `executePlan` fetches documents from a class, it internally uses methods that invoke the **Policy Engine**. Any document that the current user is not allowed to read is automatically filtered out of the results *before* any joins or processing occur. This means users will only ever see data they are permitted to see.

*   **Automatic Decryption**: After a user's read access is confirmed, the **Crypto Engine** checks for encrypted fields in the result set.
    *   If the user has the correct document key (typically unlocked upon login), any encrypted fields requested in the `SELECT` clause are automatically decrypted before being returned.
    *   If the user does not have the key, encrypted fields are returned as `null`.
    *   If a query result would only contain encrypted fields and the user lacks the key, the entire row is dropped from the final result set to avoid returning empty objects.

This seamless integration ensures that `stack.query()` is not only a powerful data retrieval tool but also a secure one.