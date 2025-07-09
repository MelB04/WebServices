const { MongoClient, ObjectId } = require("mongodb");
const express = require("express");
const z = require("zod");
const http = require("http");
const { Server } = require("socket.io");
const { createServer } = require("node:http");
const { join } = require("node:path");

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  console.log("Un client est connecté via WebSocket");

  socket.on("disconnect", () => {
    console.log("Un client s'est déconnecté");
  });
});

// Product Schema + Product Route here.
// Schemas
// Schemas
const ProductSchema = z.object({
  _id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
  categoryIds: z.array(z.string()),
});
const CreateProductSchema = ProductSchema.omit({ _id: true });
const CategorySchema = z.object({
  _id: z.string(),
  name: z.string(),
});
const CreateCategorySchema = CategorySchema.omit({ _id: true });
const PatchProductSchema = CreateProductSchema.partial();

app.post("/products", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);

  // If Zod parsed successfully the request body
  if (result.success) {
    const { name, about, price, categoryIds } = result.data;
    const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));

    const ack = await db
      .collection("products")
      .insertOne({ name, about, price, categoryIds: categoryObjectIds });

    res.send({
      _id: ack.insertedId,
      name,
      about,
      price,
      categoryIds: categoryObjectIds,
    });
    io.emit("products", {
      action: "create",
      product: {
        _id: ack.insertedId,
        name,
        about,
        price,
        categoryIds: categoryObjectIds,
      },
    });
  } else {
    res.status(400).send(result);
  }
});

app.post("/categories", async (req, res) => {
  const result = await CreateCategorySchema.safeParse(req.body);

  // If Zod parsed successfully the request body
  if (result.success) {
    const { name } = result.data;

    const ack = await db.collection("categories").insertOne({ name });

    res.send({ _id: ack.insertedId, name });
  } else {
    res.status(400).send(result);
  }
});

app.get("/products", async (req, res) => {
  const result = await db
    .collection("products")
    .aggregate([
      { $match: {} },
      {
        $lookup: {
          from: "categories",
          localField: "categoryIds",
          foreignField: "_id",
          as: "categories",
        },
      },
    ])
    .toArray();

  res.send(result);
});

app.get("/products/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db
      .collection("products")
      .aggregate([
        { $match: { _id: new ObjectId(id) } },
        {
          $lookup: {
            from: "categories",
            localField: "categoryIds",
            foreignField: "_id",
            as: "categories",
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      return res.status(404).send({ message: "Produit introuvable" });
    }

    res.send(result[0]);
  } catch (err) {
    console.error("Erreur pendant la récupération du produit :", err);
    res.status(500).send({ message: "Erreur serveur" });
  }
});

app.put("/products/:id", async (req, res) => {
  const { id } = req.params;
  const validation = CreateProductSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).send(validation);
  }

  const { name, about, price, categoryIds } = validation.data;
  const categoryObjectIds = categoryIds.map((cid) => new ObjectId(cid));

  try {
    const result = await db.collection("products").findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          name,
          about,
          price,
          categoryIds: categoryObjectIds,
        },
      },
      { returnDocument: "after" }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Produit introuvable" });
    }

    res.send(result);
    io.emit("products", {
      action: "update",
      product: result.value,
    });
  } catch (err) {
    console.error("Erreur pendant la mise à jour du produit :", err);
    res.status(500).send({ message: "Erreur serveur" });
  }
});

app.patch("/products/:id", async (req, res) => {
  const { id } = req.params;
  const validation = PatchProductSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).send(validation);
  }

  const updateFields = validation.data;

  if (updateFields.categoryIds) {
    updateFields.categoryIds = updateFields.categoryIds.map(
      (cid) => new ObjectId(cid)
    );
  }

  try {
    const result = await db
      .collection("products")
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateFields },
        { returnDocument: "after" }
      );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Produit introuvable" });
    }

    res.send(result);
    io.emit("products", {
      action: "update",
      product: result.value,
    });
  } catch (err) {
    console.error("Erreur pendant le patch du produit :", err);
    res.status(500).send({ message: "Erreur serveur" });
  }
});

app.delete("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db
      .collection("products")
      .findOneAndDelete({ _id: new ObjectId(id) }, { returnDocument: "after" });

    if (result == null) {
      return res.status(404).send({ message: "Produit introuvable" });
    }
    res.send(result);
    io.emit("products", {
      action: "delete",
      product: result.value,
    });
  } catch (err) {
    console.error("Erreur pendant la récupération du produit :", err);
    res.status(500).send({ message: "Erreur serveur" });
  }
});

// Init mongodb client connection
client.connect().then(() => {
  // Select db to use in mongodb
  db = client.db("myDB");
  server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
});
