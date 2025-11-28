import { ClientStack, Class } from "../src";
import type { ClassModel } from "@docstack/shared";
import { createSessionProof } from "../src/core/test-utils/docstack";

jest.setTimeout(30000);

describe("ClientStack.query execution", () => {
    const dbName = `query-execution-${Date.now()}`;
    let stack: ClientStack;
    let movieClass: Class;
    let actorClass: Class;
    let createdMovies: unknown[] = [];
    let actorIdsByName: Record<string, string> = {};

    const movieSchema: ClassModel["schema"] = {
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

    beforeAll(async () => {
        stack = await ClientStack.create(dbName);
        await createSessionProof(stack, "query-execution");
        actorClass = await Class.create(stack, "Actor", "class", "Actors for query execution", {
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
        movieClass = await Class.create(stack, "Movie", "class", "Movies for query execution", movieSchema);
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
        actorIdsByName = Object.fromEntries(
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
        createdMovies = await movieClass.getCards();
    });

    afterAll(async () => {
        await ClientStack.clear(dbName);
    });

    it("creates four movie documents for querying", () => {
        expect(createdMovies).toHaveLength(4);
    });

    it("returns projected rows for a basic SELECT query", async () => {
        const { rows } = await stack.query(`
            SELECT m.title, m.year
            FROM Movie AS m
            WHERE m.year >= 2000
            ORDER BY m.year ASC;
        `);

        expect(rows).toEqual([
            { title: "Memento", year: 2000 },
            { title: "Inception", year: 2010 },
            { title: "Interstellar", year: 2014 }
        ]);
    });

    it("returns scalar aggregation results", async () => {
        const { rows } = await stack.query(`
            SELECT COUNT(*) AS total_movies, AVG(m.rating) AS avg_rating
            FROM Movie AS m;
        `);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ total_movies: 4 });
        expect(rows[0].avg_rating).toBeCloseTo((8.7 + 8.8 + 8.6 + 8.4) / 4, 5);
    });

    it("supports joining array references to related actor documents", async () => {
        const { rows } = await stack.query(`
            SELECT m.title, a.name AS actor_name
            FROM Movie AS m
            JOIN Actor AS a ON a._id IN m.actors
            WHERE m.year >= 2000
            ORDER BY m.title ASC, actor_name ASC;
        `);

        expect(rows).toEqual([
            { title: "Inception", actor_name: "Ken Watanabe" },
            { title: "Inception", actor_name: "Leonardo DiCaprio" },
            { title: "Interstellar", actor_name: "Anne Hathaway" },
            { title: "Interstellar", actor_name: "Matthew McConaughey" },
            { title: "Memento", actor_name: "Guy Pearce" }
        ]);
    });

    it("filters using scalar subqueries", async () => {
        const { rows } = await stack.query(`
            SELECT m.title
            FROM Movie AS m
            WHERE m.rating > (SELECT AVG(m2.rating) FROM Movie AS m2)
            ORDER BY m.title ASC;
        `);

        expect(rows).toEqual([
            { title: "Inception" },
            { title: "The Matrix" }
        ]);
    });

    it("combines joins with subquery filters", async () => {
        const { rows } = await stack.query(`
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

        expect(rows).toEqual([
            { actor_name: "Ken Watanabe", title: "Inception" },
            { actor_name: "Leonardo DiCaprio", title: "Inception" }
        ]);
    });

    it("deduplicates overlapping rows with UNION", async () => {
        const { rows } = await stack.query(`
            SELECT m.title
            FROM Movie AS m
            WHERE m.year >= 2000
            UNION
            SELECT m.title
            FROM Movie AS m
            WHERE m.year >= 2000
            ORDER BY title ASC;
        `);

        expect(rows).toEqual([
            { title: "Inception" },
            { title: "Interstellar" },
            { title: "Memento" }
        ]);
    });

    it("preserves duplicates when using UNION ALL", async () => {
        const { rows } = await stack.query(`
            SELECT m.title
            FROM Movie AS m
            WHERE m.year >= 2000
            UNION ALL
            SELECT m.title
            FROM Movie AS m
            WHERE m.year >= 2000
            ORDER BY title ASC;
        `);

        expect(rows).toEqual([
            { title: "Inception" },
            { title: "Inception" },
            { title: "Interstellar" },
            { title: "Interstellar" },
            { title: "Memento" },
            { title: "Memento" }
        ]);
    });

    it("returns distinct values", async () => {
        const { rows } = await stack.query(`
            SELECT DISTINCT a.born
            FROM Actor AS a
            ORDER BY a.born ASC;
        `);

        expect(rows).toEqual([
            { born: 1959 },
            { born: 1961 },
            { born: 1964 },
            { born: 1967 },
            { born: 1969 },
            { born: 1974 },
            { born: 1982 }
        ]);
    });

    it("keeps the first row per key with DISTINCT ON", async () => {
        const { rows } = await stack.query(`
            SELECT DISTINCT ON (m.title) m.title, a.name AS actor_name
            FROM Movie AS m
            JOIN Actor AS a ON a._id IN m.actors
            ORDER BY m.title ASC, actor_name ASC;
        `);

        expect(rows).toEqual([
            { actor_name: "Ken Watanabe", title: "Inception" },
            { actor_name: "Anne Hathaway", title: "Interstellar" },
            { actor_name: "Guy Pearce", title: "Memento" },
            { actor_name: "Carrie-Anne Moss", title: "The Matrix" }
        ]);
    });

    it("groups joined rows and filters with HAVING", async () => {
        const { rows } = await stack.query(`
            SELECT m.title, COUNT(*) AS actor_count
            FROM Movie AS m
            JOIN Actor AS a ON a._id IN m.actors
            GROUP BY m.title
            HAVING COUNT(*) >= 2
            ORDER BY actor_count DESC, m.title ASC;
        `);

        expect(rows).toEqual([
            { actor_count: 3, title: "The Matrix" },
            { actor_count: 2, title: "Inception" },
            { actor_count: 2, title: "Interstellar" }
        ]);
    });

    it("combines grouped queries with UNION ALL", async () => {
        const { rows } = await stack.query(`
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

        expect(rows).toEqual([
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
