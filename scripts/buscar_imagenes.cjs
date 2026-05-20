const fs = require("fs");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
require("dotenv").config();

const INPUT_FILE = "./pruebaaa.csv";
const OUTPUT_FILE = "./productos_con_fotos_directas.csv";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;

const MAX_PRODUCTS = 20; // probamos primero con 20
const DELAY_MS = 1200;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function getValue(row, possibleNames) {
    const normalizedRow = {};

    for (const key of Object.keys(row)) {
        normalizedRow[key.trim().toLowerCase()] = row[key];
    }

    for (const name of possibleNames) {
        const normalizedName = name.trim().toLowerCase();

        if (normalizedRow[normalizedName] !== undefined) {
            return normalizedRow[normalizedName];
        }
    }

    return "";
}


async function buscarImagenDirecta(producto) {
    const nombre = cleanText(
        getValue(producto, ["Productos", "productos", "Producto", "producto", "nombre", "Nombre"])
    );

    const marca = cleanText(
        getValue(producto, ["marca", "Marca", "brand", "Brand"])
    );

    if (!nombre) return "";

    const query = `${nombre} ${marca} producto supermercado argentina`;

    const url =
        "https://www.googleapis.com/customsearch/v1?" +
        new URLSearchParams({
            key: GOOGLE_API_KEY,
            cx: GOOGLE_CX,
            q: query,
            searchType: "image",
            num: "1",
            safe: "active",
            imgSize: "medium",
        });

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.log("Error API:", data.error?.message || data);
            return "";
        }

        return data.items?.[0]?.link || "";
    } catch (error) {
        console.log("Error buscando imagen:", error.message);
        return "";
    }
}

async function main() {
    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        console.log("Falta GOOGLE_API_KEY o GOOGLE_CX en el archivo .env");
        return;
    }

    const productos = [];

    fs.createReadStream(INPUT_FILE)
        .pipe(csv({ separator: ";" }))
        .on("data", (row) => productos.push(row))
        .on("end", async () => {
            console.log(`Productos leídos: ${productos.length}`);
            console.log("Columnas detectadas:", Object.keys(productos[0] || {}));

            const resultado = [];

            for (let i = 0; i < productos.length && i < MAX_PRODUCTS; i++) {
                const producto = productos[i];

                const nombre = cleanText(
                    getValue(producto, ["Productos", "productos", "Producto", "producto", "nombre", "Nombre"])
                );

                console.log(`Buscando imagen ${i + 1}/${MAX_PRODUCTS}: ${nombre}`);

                const imagenDirecta = await buscarImagenDirecta(producto);

                producto.foto_url = imagenDirecta;
                producto.foto_estado = imagenDirecta ? "revisar" : "sin_imagen";

                resultado.push(producto);

                await sleep(DELAY_MS);
            }

            const headers = Object.keys(resultado[0] || productos[0]).map((key) => ({
                id: key,
                title: key,
            }));

            const csvWriter = createCsvWriter({
                path: OUTPUT_FILE,
                header: headers,
                fieldDelimiter: ";",
            });

            await csvWriter.writeRecords(resultado);

            console.log("Listo. Archivo generado:");
            console.log(OUTPUT_FILE);
        });
}

main();