# DocStack

DocStack is a versatile framework for managing NoSQL databases. It provides a full suite of tools, from a powerful backend to a user-friendly graphical interface, making it easier than ever to interact with and manage your data. It's built around [PouchDB](https://pouchdb.com/).

### What's Inside? Our Monorepo Explained

We've organized DocStack into a single repository to ensure tight integration and a consistent developer experience. Each package plays a critical role in the framework:

* **`docstack/client`**: The bridge to your data. This package provides a simple yet powerful API for any application to connect to the DocStack server and perform read/write operations. Its unique ability to be **run directly in a web browser** makes it easy to build powerful, client-side data management tools.
* **`docstack/server`**: The robust foundation. This backend is engineered to handle all your database needs, providing a secure and scalable way to manage your data.
* **`docstack/react`**: The front-end toolkit. We've built a set of production-ready React components that directly consume the client, allowing you to build beautiful and interactive data interfaces in minutes, not hours.
* **`docstack/ui`**: The visual companion. This is a standalone graphical application that serves as a complete workbench. Explore your database, run queries, and manage your schema with a clean, intuitive interface—all without touching the command line.
