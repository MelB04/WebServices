const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const { z } = require("zod");

const app = express();
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

const BaseSchema = {
  source: z.string(),
  url: z.string(),
  visitor: z.string(),
  createdAt: z.coerce.date().optional(),
  meta: z.record(z.any()).default({}),
};

const ViewSchema = z.object(BaseSchema);
const ActionSchema = z.object({
  ...BaseSchema,
  action: z.string(),
});
const GoalSchema = z.object({
  ...BaseSchema,
  goal: z.string(),
});

function createCRUDRoutes(name, schema) {
  const collection = () => db.collection(name);

  app.post(`/${name}`, async (req, res) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result);

    const doc = {
      ...result.data,
      createdAt: result.data.createdAt || new Date(),
    };

    try {
      const ack = await collection().insertOne(doc);
      res.status(201).send({ _id: ack.insertedId, ...doc });
    } catch (err) {
      console.error(`Erreur création ${name.slice(0, -1)} :`, err);
      res.status(500).send({ message: "Erreur serveur" });
    }
  });

  app.get(`/${name}`, async (_req, res) => {
    try {
      const docs = await collection().find().toArray();
      res.send(docs);
    } catch (err) {
      console.error(`Erreur récupération ${name} :`, err);
      res.status(500).send({ message: "Erreur serveur" });
    }
  });

  app.get(`/${name}/:id`, async (req, res) => {
    try {
      const doc = await collection().findOne({
        _id: new ObjectId(req.params.id),
      });
      if (!doc)
        return res
          .status(404)
          .send({ message: `${name.slice(0, -1)} introuvable` });
      res.send(doc);
    } catch (err) {
      console.error(`Erreur lecture ${name.slice(0, -1)} :`, err);
      res.status(500).send({ message: "Erreur serveur" });
    }
  });

  app.put(`/${name}/:id`, async (req, res) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result);

    try {
      const updated = await collection().findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: result.data },
        { returnDocument: "after" }
      );
      if (!updated.value)
        return res
          .status(404)
          .send({ message: `${name.slice(0, -1)} introuvable` });
      res.send(updated.value);
    } catch (err) {
      console.error(`Erreur update ${name.slice(0, -1)} :`, err);
      res.status(500).send({ message: "Erreur serveur" });
    }
  });

  app.delete(`/${name}/:id`, async (req, res) => {
    try {
      const deleted = await collection().findOneAndDelete({
        _id: new ObjectId(req.params.id),
      });
      if (!deleted.value)
        return res
          .status(404)
          .send({ message: `${name.slice(0, -1)} introuvable` });
      res.send(deleted.value);
    } catch (err) {
      console.error(`Erreur delete ${name.slice(0, -1)} :`, err);
      res.status(500).send({ message: "Erreur serveur" });
    }
  });
}

createCRUDRoutes("views", ViewSchema);
createCRUDRoutes("actions", ActionSchema);
createCRUDRoutes("goals", GoalSchema);

app.get("/goals/:goalId/details", async (req, res) => {
  const { goalId } = req.params;

  const goal = await db
    .collection("goals")
    .findOne({ _id: new ObjectId(goalId) });

  if (!goal) {
    return res.status(404).send({ message: "Goal introuvable" });
  }

  const visitorId = goal.visitor;

  const result = await db
    .collection("goals")
    .aggregate([
      { $match: { _id: new ObjectId(goalId) } },
      {
        $lookup: {
          from: "views",
          localField: "visitor",
          foreignField: "visitor",
          as: "views",
        },
      },
      {
        $lookup: {
          from: "actions",
          localField: "visitor",
          foreignField: "visitor",
          as: "actions",
        },
      },
    ])
    .toArray();

  res.send(result);
});

client.connect().then(() => {
  db = client.db("myDB");
  app.listen(port, () => {
    console.log(`API REST Analytics lancée sur http://localhost:${port}`);
    console.log("Endpoints disponibles : /views, /actions, /goals");
  });
});
