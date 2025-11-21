import { ClientStack, Class } from "../src";
import type { ClassModel } from "@docstack/shared";

describe("ClientStack.query execution", () => {
    const dbName = `query-execution-${Date.now()}`;
    let stack: ClientStack;
    let movieClass: Class;
    let createdMovies: unknown[] = [];

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
        }
    };

    beforeAll(async () => {
        stack = await ClientStack.create(dbName);
        movieClass = await Class.create(stack, "Movie", "class", "Movies for query execution", movieSchema);
        const movies = [
            { title: "The Matrix", year: 1999, rating: 8.7 },
            { title: "Inception", year: 2010, rating: 8.8 },
            { title: "Interstellar", year: 2014, rating: 8.6 },
            { title: "Memento", year: 2000, rating: 8.4 }
        ];
        for (const movie of movies) {
            await movieClass.addCard(movie);
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
});
