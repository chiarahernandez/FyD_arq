FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

# Solo el código del servicio: el proyecto Hardhat (contracts/) no entra en la imagen,
# el servicio usa la ABI ya generada en src/contract/.
COPY src ./src

EXPOSE 3006
CMD ["npm", "start"]
