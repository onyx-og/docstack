import { test as it, expect } from './fixtures';

it.setTimeout(60000);
const describe = it.describe;

describe("ClientStack.query execution", () => {
    it("executes complex SQL queries against a populated database", async ({ useDocStack }) => {
        const result = await useDocStack({
            name: `query-exec-${Date.now()}`,
            username: "db-query-execution",
            password: "password-query",
            evaluate: async ({ stack }) => {
                const { Class } = (window as any).docstack;

                // --- Setup ---
                const actorClass = await Class.create(stack, "Actor", "class", "Actors for query execution", {
                    name: {
                        name: "name",
                        type: "string",
                        config: { maxLength: 200, mandatory: true, primaryKey: true }
                    },
                    born: {
                        name: "born",
                        type: "integer",
                        config: { min: 1900 }
                    }
                });

                const movieSchema = {
                    title: {
                        name: "title",
                        type: "string",
                        config: { maxLength: 200, mandatory: true, primaryKey: true }
                    },
                    year: {
                        name: "year",
                        type: "integer",
                        config: { min: 1900, mandatory: true }
                    },
                    rating: {
                        name: "rating",
                        type: "decimal",
                        config: { min: 0, max: 10 }
                    },
                    actors: {
                        name: "actors",
                        type: "string",
                        config: { isArray: true }
                    }
                };

                const movieClass = await Class.create(stack, "Movie", "class", "Movies for query execution", movieSchema);

                const actors = [
                    { name: "Keanu Reeves", born: 1964 },
                    { name: "Carrie-Anne Moss", born: 1967 },
                    { name: "Laurence Fishburne", born: 1961 },
                    { name: "Leonardo DiCaprio", born: 1974 },
                    { name: "Ken Watanabe", born: 1959 },
                    { name: "Matthew McConaughey", born: 1969 },
                    { name: "Anne Hathaway", born: 1982 },
                    { name: "Guy Pearce", born: 1967 }
                ];

                for (const actor of actors) {
                    await actorClass.addCard(actor);
                }

                const createdActors = await actorClass.getCards();
                const actorIdsByName = Object.fromEntries(
                    createdActors.map((actor) => [actor.name, actor._id!])
                );

                const movies = [
                    { title: "The Matrix", year: 1999, rating: 8.7, actors: ["Keanu Reeves", "Carrie-Anne Moss", "Laurence Fishburne"] },
                    { title: "Inception", year: 2010, rating: 8.8, actors: ["Leonardo DiCaprio", "Ken Watanabe"] },
                    { title: "Interstellar", year: 2014, rating: 8.6, actors: ["Matthew McConaughey", "Anne Hathaway"] },
                    { title: "Memento", year: 2000, rating: 8.4, actors: ["Guy Pearce"] }
                ];

                for (const movie of movies) {
                    await movieClass.addCard({
                        ...movie,
                        actors: movie.actors.map((actorName) => actorIdsByName[actorName])
                    });
                }
                
                const createdMovies = await movieClass.getCards();

                // --- Queries ---

                // 1. Basic SELECT
                const { rows: selectRows } = await stack.query(`
                    SELECT m.title, m.year
                    FROM Movie AS m
                    WHERE m.year >= 2000
                    ORDER BY m.year ASC;
                `);

                // 2. Aggregation
                const { rows: aggRows } = await stack.query(`
                    SELECT COUNT(*) AS total_movies, AVG(m.rating) AS avg_rating
                    FROM Movie AS m;
                `);

                // 3. Join array references
                const { rows: joinRows } = await stack.query(`
                    SELECT m.title, a.name AS actor_name
                    FROM Movie AS m
                    JOIN Actor AS a ON a._id IN m.actors
                    WHERE m.year >= 2000
                    ORDER BY m.title ASC, actor_name ASC;
                `);

                // 4. Scalar subqueries
                const { rows: subqueryRows } = await stack.query(`
                    SELECT m.title
                    FROM Movie AS m
                    WHERE m.rating > (SELECT AVG(m2.rating) FROM Movie AS m2)
                    ORDER BY m.title ASC;
                `);

                // 5. Join with subquery filters
                const { rows: complexJoinRows } = await stack.query(`
                    SELECT a.name AS actor_name, m.title
                    FROM Movie AS m
                    JOIN Actor AS a ON a._id IN m.actors
                    WHERE m.rating >= (
                        SELECT MAX(m2.rating)
                        FROM Movie AS m2
                        WHERE m2.year >= 2000
                    )
                    ORDER BY actor_name ASC;
                `);

                // 6. UNION
                const { rows: unionRows } = await stack.query(`
                    SELECT m.title
                    FROM Movie AS m
                    WHERE m.year >= 2000
                    UNION
                    SELECT m.title
                    FROM Movie AS m
                    WHERE m.year >= 2000
                    ORDER BY title ASC;
                `);

                // 7. UNION ALL
                const { rows: unionAllRows } = await stack.query(`
                    SELECT m.title
                    FROM Movie AS m
                    WHERE m.year >= 2000
                    UNION ALL
                    SELECT m.title
                    FROM Movie AS m
                    WHERE m.year >= 2000
                    ORDER BY title ASC;
                `);

                // 8. DISTINCT
                const { rows: distinctRows } = await stack.query(`
                    SELECT DISTINCT a.born
                    FROM Actor AS a
                    ORDER BY a.born ASC;
                `);

                // 9. DISTINCT ON
                const { rows: distinctOnRows } = await stack.query(`
                    SELECT DISTINCT ON (m.title) m.title, a.name AS actor_name
                    FROM Movie AS m
                    JOIN Actor AS a ON a._id IN m.actors
                    ORDER BY m.title ASC, actor_name ASC;
                `);

                // 10. HAVING
                const { rows: havingRows } = await stack.query(`
                    SELECT m.title, COUNT(*) AS actor_count
                    FROM Movie AS m
                    JOIN Actor AS a ON a._id IN m.actors
                    GROUP BY m.title
                    HAVING COUNT(*) >= 2
                    ORDER BY actor_count DESC, m.title ASC;
                `);

                // 11. Grouped UNION ALL
                const { rows: groupedUnionRows } = await stack.query(`
                    SELECT m.year, COUNT(*) AS movie_count
                    FROM Movie AS m
                    GROUP BY m.year
                    HAVING COUNT(*) >= 1
                    UNION ALL
                    SELECT m.year, COUNT(*) AS movie_count
                    FROM Movie AS m
                    WHERE m.year >= 2000
                    GROUP BY m.year
                    ORDER BY year ASC;
                `);

                return {
                    movieCount: createdMovies.length,
                    selectRows,
                    aggRows,
                    joinRows,
                    subqueryRows,
                    complexJoinRows,
                    unionRows,
                    unionAllRows,
                    distinctRows,
                    distinctOnRows,
                    havingRows,
                    groupedUnionRows
                };
            }
        });

        // Assertions
        expect(result.movieCount).toBe(4);

        expect(result.selectRows).toEqual([
            { title: "Memento", year: 2000 },
            { title: "Inception", year: 2010 },
            { title: "Interstellar", year: 2014 }
        ]);

        expect(result.aggRows).toHaveLength(1);
        expect(result.aggRows[0]).toMatchObject({ total_movies: 4 });
        // Floating point comparison
        const expectedAvg = (8.7 + 8.8 + 8.6 + 8.4) / 4;
        expect(result.aggRows[0].avg_rating).toBeCloseTo(expectedAvg, 5);

        expect(result.joinRows).toEqual([
            { title: "Inception", actor_name: "Ken Watanabe" },
            { title: "Inception", actor_name: "Leonardo DiCaprio" },
            { title: "Interstellar", actor_name: "Anne Hathaway" },
            { title: "Interstellar", actor_name: "Matthew McConaughey" },
            { title: "Memento", actor_name: "Guy Pearce" }
        ]);

        expect(result.subqueryRows).toEqual([
            { title: "Inception" },
            { title: "The Matrix" }
        ]);

        expect(result.complexJoinRows).toEqual([
            { actor_name: "Ken Watanabe", title: "Inception" },
            { actor_name: "Leonardo DiCaprio", title: "Inception" }
        ]);

        expect(result.unionRows).toEqual([
            { title: "Inception" },
            { title: "Interstellar" },
            { title: "Memento" }
        ]);

        expect(result.unionAllRows).toEqual([
            { title: "Inception" },
            { title: "Inception" },
            { title: "Interstellar" },
            { title: "Interstellar" },
            { title: "Memento" },
            { title: "Memento" }
        ]);

        expect(result.distinctRows).toEqual([
            { born: 1959 },
            { born: 1961 },
            { born: 1964 },
            { born: 1967 },
            { born: 1969 },
            { born: 1974 },
            { born: 1982 }
        ]);

        expect(result.distinctOnRows).toEqual([
            { actor_name: "Ken Watanabe", title: "Inception" },
            { actor_name: "Anne Hathaway", title: "Interstellar" },
            { actor_name: "Guy Pearce", title: "Memento" },
            { actor_name: "Carrie-Anne Moss", title: "The Matrix" }
        ]);

        expect(result.havingRows).toEqual([
            { actor_count: 3, title: "The Matrix" },
            { actor_count: 2, title: "Inception" },
            { actor_count: 2, title: "Interstellar" }
        ]);

        expect(result.groupedUnionRows).toEqual([
            { movie_count: 1, year: 1999 },
            { movie_count: 1, year: 2000 },
            { movie_count: 1, year: 2000 },
            { movie_count: 1, year: 2010 },
            { movie_count: 1, year: 2010 },
            { movie_count: 1, year: 2014 },
            { movie_count: 1, year: 2014 }
        ]);
    });
});