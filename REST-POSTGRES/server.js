const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const app = express();
const port = 8000;
const sql = postgres({
  db: "MythicGamesRest",
  user: "postgres",
  password: "root",
});

app.use(express.json());

/**
 * @swagger
 * tags:
 *   - name: Produits
 *     description: Gestion des produits
 *   - name: Utilisateurs
 *     description: Gestion des utilisateurs
 *   - name: Commandes
 *     description: Gestion des commandes
 *   - name: FreeToPlay Games
 *     description: Jeux Free to Play externes
 */

// Schemas
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
});

const CreateProductSchema = ProductSchema.omit({ id: true });

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Swagger UI at http://localhost:${port}/api-docs`);
});

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Crée un nouveau produit
 *     tags: [Produits]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - about
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *               about:
 *                 type: string
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Produit créé avec succès
 */
app.post("/products", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);

  // If Zod parsed successfully the request body
  if (result.success) {
    const { name, about, price } = result.data;

    const product = await sql`
    INSERT INTO products (name, about, price)
    VALUES (${name}, ${about}, ${price})
    RETURNING *
    `;

    res.send(product[0]);
  } else {
    res.status(400).send(result);
  }
});

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Liste tous les produits avec filtres optionnels
 *     tags: [Produits]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filtrer par nom (partiel)
 *       - in: query
 *         name: about
 *         schema:
 *           type: string
 *         description: Filtrer par description (partiel)
 *       - in: query
 *         name: price
 *         schema:
 *           type: number
 *         description: Prix max
 *     responses:
 *       200:
 *         description: Liste des produits
 */
app.get("/products", async (req, res) => {
  const filters = [];
  const values = [];
  const { name, about, price } = req.query;

  if (name !== undefined) {
    filters.push(`UPPER(name) LIKE UPPER($${values.length + 1})`);
    values.push(`%${name}%`);
  }
  if (about !== undefined) {
    filters.push(`UPPER(about) LIKE UPPER($${values.length + 1})`);
    values.push(`%${about}%`);
  }
  if (price !== undefined) {
    const parsedPrice = parseFloat(price);
    filters.push(`price <= $${values.length + 1}`);
    values.push(parsedPrice);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const query = `
      SELECT * FROM products
      ${whereClause}
    `;
  const products = await sql.unsafe(query, values);

  res.send(products);
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Récupère un produit par ID
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du produit
 *     responses:
 *       200:
 *         description: Détails du produit
 *       404:
 *         description: Produit non trouvé
 */
app.get("/products/:id", async (req, res) => {
  const product = await sql`
    SELECT * FROM products WHERE id=${req.params.id}
    `;

  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Supprime un produit par ID
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du produit à supprimer
 *     responses:
 *       200:
 *         description: Produit supprimé
 *       404:
 *         description: Produit non trouvé
 */
app.delete("/products/:id", async (req, res) => {
  const product = await sql`
    DELETE FROM products
    WHERE id=${req.params.id}
    RETURNING *
    `;

  if (product.length > 0) {
    res.send(product[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  nom: z.string(),
  pwd: z.string(),
});

const CreateUserSchema = UserSchema.omit({ id: true });
const UpdateUserSchemaPut = UserSchema.omit({ id: true });
const UpdateUserSchemaPatch = UserSchema.pick({
  email: true,
  nom: true,
  pwd: true,
}).partial();

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Crée un nouvel utilisateur
 *     tags: [Utilisateurs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - nom
 *               - pwd
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               nom:
 *                 type: string
 *               pwd:
 *                 type: string
 *     responses:
 *       200:
 *         description: Utilisateur créé avec succès
 */
app.post("/users", async (req, res) => {
  const result = await CreateUserSchema.safeParse(req.body);

  // If Zod parsed successfully the request body
  if (result.success) {
    const { email, nom, pwd } = result.data;

    const salt = crypto.createHash("sha512").update(pwd).digest("hex");

    const user = await sql`
    INSERT INTO users (email, nom, pwd)
    VALUES (${email}, ${nom}, ${salt})
    RETURNING id, email, nom
    `;

    res.send(user[0]);
  } else {
    res.status(400).send(result);
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Liste tous les utilisateurs
 *     tags: [Utilisateurs]
 *     responses:
 *       200:
 *         description: Liste des utilisateurs
 */
app.get("/users", async (req, res) => {
  const users = await sql`
    SELECT id, email, nom FROM users
    `;

  res.send(users);
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Récupère un utilisateur par ID
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de l'utilisateur
 *     responses:
 *       200:
 *         description: Détails de l'utilisateur
 *       404:
 *         description: Utilisateur non trouvé
 */
app.get("/users/:id", async (req, res) => {
  const user = await sql`
    SELECT id,  email, nom  FROM users WHERE id=${req.params.id}
    `;

  if (user.length > 0) {
    res.send(user[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Supprime un utilisateur par ID
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de l'utilisateur à supprimer
 *     responses:
 *       200:
 *         description: Utilisateur supprimé
 *       404:
 *         description: Utilisateur non trouvé
 */
app.delete("/users/:id", async (req, res) => {
  const user = await sql`
    DELETE FROM users
    WHERE id=${req.params.id}
    RETURNING  id, email, nom 
    `;

  if (user.length > 0) {
    res.send(user[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Met à jour un utilisateur (PUT)
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de l'utilisateur à mettre à jour
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - nom
 *               - pwd
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               nom:
 *                 type: string
 *               pwd:
 *                 type: string
 *     responses:
 *       200:
 *         description: Utilisateur mis à jour avec succès
 *       400:
 *         description: Erreur dans les données
 */
app.put("/users/:id", async (req, res) => {
  const result = await UpdateUserSchemaPut.safeParse(req.body);

  // If Zod parsed successfully the request body
  if (result.success) {
    const id = req.params.id;

    const { email, nom, pwd } = result.data;
    const salt = crypto.createHash("sha512").update(pwd).digest("hex");

    const user = await sql`
        UPDATE users SET 
        email =${email}, nom= ${nom}, pwd =${salt}
        WHERE id = ${id}
        RETURNING  id,email, nom`;

    res.send(user[0]);
  } else {
    res.status(400).send(result);
  }
});

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Met à jour partiellement un utilisateur (PATCH)
 *     tags: [Utilisateurs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de l'utilisateur à modifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               nom:
 *                 type: string
 *               pwd:
 *                 type: string
 *     responses:
 *       200:
 *         description: Utilisateur mis à jour partiellement
 *       400:
 *         description: Erreur dans les données ou rien à mettre à jour
 */
app.patch("/users/:id", async (req, res) => {
  const result = await UpdateUserSchemaPatch.safeParse(req.body);

  if (result.success) {
    const id = req.params.id;
    const { email, nom, pwd } = result.data;

    const updates = [];

    if (email !== undefined) {
      updates.push(sql`email = ${email}`);
    }
    if (nom !== undefined) {
      updates.push(sql`nom = ${nom}`);
    }
    if (pwd !== undefined) {
      const hash = crypto.createHash("sha512").update(pwd).digest("hex");
      updates.push(sql`pwd = ${hash}`);
    }

    if (updates.length === 0) {
      return res.status(400).send({ error: "Aucune donnée à mettre à jour." });
    }

    const setClause = updates.reduce(
      (acc, part, i) => (i === 0 ? part : sql`${acc}, ${part}`),
      sql``
    );

    const updateQuery = sql`
        UPDATE users
        SET ${setClause}
        WHERE id = ${id}
        RETURNING id, email, nom
        `;
    const user = await updateQuery;
    res.send(user[0]);
  } else {
    res.status(400).send(result);
  }
});

/**
 * @swagger
 * /f2p-games:
 *   get:
 *     summary: Liste les jeux Free To Play externes
 *     tags: [FreeToPlay Games]
 *     responses:
 *       200:
 *         description: Liste des jeux
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
app.get("/f2p-games", async (req, res) => {
  const response = await fetch("https://www.freetogame.com/api/games");
  const data = await response.json();
  res.send(data);
});

/**
 * @swagger
 * /f2p-games/{id}:
 *   get:
 *     summary: Récupère un jeu Free To Play par ID
 *     tags: [FreeToPlay Games]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID du jeu
 *     responses:
 *       200:
 *         description: Détails du jeu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
app.get("/f2p-games/:id", async (req, res) => {
  const idGame = req.params.id;

  const response = await fetch(
    `https://www.freetogame.com/api/game?id=${idGame}`
  );
  const data = await response.json();

  res.send(data);
});

const OrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  payment: z.boolean(),
  productIds: z.array(z.string()).nonempty(),
});

const CreateOrderSchema = OrderSchema.omit({ id: true });

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Crée une nouvelle commande
 *     tags: [Commandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - productIds
 *               - payment
 *             properties:
 *               userId:
 *                 type: string
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               payment:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Commande créée avec succès
 *       400:
 *         description: Erreur dans les données
 */
app.post("/orders", async (req, res) => {
  const result = await CreateOrderSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).send(result.error);
  }

  const { userId, productIds, payment } = result.data;

  const products = await sql`
    SELECT * FROM products WHERE id = ANY(${productIds})
  `;

  if (products.length !== productIds.length) {
    return res
      .status(400)
      .send({ error: "Un ou plusieurs produits n'existent pas." });
  }

  const total = products.reduce((sum, p) => sum + p.price, 0) * 1.2;
  const [order] = await sql`
    INSERT INTO orders (userId, total, payment)
    VALUES (${userId}, ${total}, ${payment} )
    RETURNING *
  `;
  for (const productId of productIds) {
    await sql`
      INSERT INTO productsorders (orderId, productId)
      VALUES (${order.id}, ${productId})
    `;
  }

  res.status(201).send(order);
});

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Liste toutes les commandes
 *     tags: [Commandes]
 *     responses:
 *       200:
 *         description: Liste des commandes avec détails
 */
app.get("/orders", async (req, res) => {
  const orders = await sql`
    SELECT * FROM orders
  `;

  const detailedOrders = await Promise.all(
    orders.map(async (order) => {
      const [user] = await sql`
        SELECT id, email, nom FROM users WHERE id = ${order.userid}
      `;

      const products = await sql`
        SELECT p.*
        FROM products p
        JOIN productsorders po ON po.productId = p.id
        WHERE po.orderId = ${order.id}
      `;

      return {
        ...order,
        user,
        products,
      };
    })
  );

  res.send(detailedOrders);
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Récupère une commande par ID
 *     tags: [Commandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Détails de la commande
 *       404:
 *         description: Commande non trouvée
 */
app.get("/orders/:id", async (req, res) => {
  const id = req.params.id;

  const [order] = await sql`
    SELECT * FROM orders WHERE id = ${id}
  `;

  if (!order) return res.status(404).send({ error: "Commande non trouvée." });

  const [user] = await sql`
    SELECT id, email, nom FROM users WHERE id = ${order.userid}
  `;

  const products = await sql`
    SELECT p.*
    FROM products p
    JOIN productsorders po ON po.productId = p.id
    WHERE po.orderId = ${id}
  `;

  res.send({ ...order, user, products });
});

/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     summary: Supprime une commande par ID
 *     tags: [Commandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la commande à supprimer
 *     responses:
 *       200:
 *         description: Commande supprimée
 *       404:
 *         description: Commande non trouvée
 */
app.delete("/orders/:id", async (req, res) => {
  const id = req.params.id;

  const [order] = await sql`
    SELECT * FROM orders WHERE id = ${id}
  `;

  if (!order) return res.status(404).send({ error: "Commande non trouvée." });

  const [productsorders] = await sql`
    DELETE FROM productsorders WHERE orderid = ${id} RETURNING *;
  `;

  const orders = await sql`
    DELETE FROM orders WHERE id = ${id} RETURNING *;
  `;

  if (orders.length > 0) {
    res.send(orders[0]);
  } else {
    res.status(404).send({ message: "Not found" });
  }
});

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Mythic Games API",
      version: "1.0.0",
      description:
        "API REST pour la gestion des produits, utilisateurs et commandes d'un magasin de jeux vidéo 🕹️",
    },
    servers: [
      {
        url: "http://localhost:8000",
      },
    ],
  },
  apis: ["./server.js"],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
