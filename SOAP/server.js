const soap = require("soap");
const fs = require("node:fs");
const http = require("http");
const postgres = require("postgres");

const sql = postgres({ db: "MythicGames", user: "postgres", password: "root" });

// Define the service implementation
const service = {
  ProductsService: {
    ProductsPort: {
      CreateProduct: async function ({ name, about, price }, callback) {
        if (!name || !about || !price) {
          throw {
            Fault: {
              Code: {
                Value: "soap:Sender",
                Subcode: { value: "rpc:BadArguments" },
              },
              Reason: { Text: "Processing Error" },
              statusCode: 400,
            },
          };
        }

        const product = await sql`
            INSERT INTO products (name, about, price)
            VALUES (${name}, ${about}, ${price})
            RETURNING *
        `;

        // Will return only one element.
        callback(product[0]);
      },
      GetProducts: async function (_, callback) {
        const products = await sql`
            SELECT * FROM products
            `;

        // Will return only one element.
        callback(products);
      },

      PatchProduct: async function ({ id, name, about, price }, callback) {
        // Validation des paramètres requis
        if (!id) {
          throw {
            Fault: {
              Code: {
                Value: "soap:Sender",
                Subcode: { value: "rpc:BadArguments" },
              },
              Reason: { Text: "Product ID is required" },
              statusCode: 400,
            },
          };
        }

        if (!name || !about || !price) {
          throw {
            Fault: {
              Code: {
                Value: "soap:Sender",
                Subcode: { value: "rpc:BadArguments" },
              },
              Reason: { Text: "Name, about, and price are required" },
              statusCode: 400,
            },
          };
        }

        try {
          // Vérifier d'abord si le produit existe
          const existingProduct = await sql`
      SELECT id FROM products WHERE id = ${id}
    `;

          if (existingProduct.length === 0) {
            throw {
              Fault: {
                Code: {
                  Value: "soap:Sender",
                  Subcode: { value: "rpc:ProductNotFound" },
                },
                Reason: { Text: `Product with id '${id}' not found` },
                statusCode: 404,
              },
            };
          }

          // Mettre à jour le produit
          const result = await sql`
      UPDATE products 
      SET name = ${name}, about = ${about}, price = ${price}
      WHERE id = ${id}
      RETURNING id, name, about, price
    `;
          callback(result[0]);
        } catch (error) {
          if (error.Fault) {
            throw error;
          }

          throw {
            Fault: {
              Code: {
                Value: "soap:Server",
                Subcode: { value: "rpc:InternalError" },
              },
              Reason: { Text: "Internal server error during product update" },
              statusCode: 500,
            },
          };
        }
      },
    },
  },
};

// http server example
const server = http.createServer(function (request, response) {
  response.end("404: Not Found: " + request.url);
});

server.listen(8000);

// Create the SOAP server
const xml = fs.readFileSync("productsService.wsdl", "utf8");
soap.listen(server, "/products", service, xml, function () {
  console.log("SOAP server running at http://localhost:8000/products?wsdl");
});
