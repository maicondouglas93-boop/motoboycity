-- Motoboy contratado com salário fixo: a entrega dele fica inteira com a
-- plataforma, nada entra na carteira, e o app não mostra valores a ele.
-- Aditiva: todo motoboy existente continua por corrida.

-- CreateEnum
CREATE TYPE "DriverCompensation" AS ENUM ('PER_DELIVERY', 'SALARIED');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "compensation" "DriverCompensation" NOT NULL DEFAULT 'PER_DELIVERY';
