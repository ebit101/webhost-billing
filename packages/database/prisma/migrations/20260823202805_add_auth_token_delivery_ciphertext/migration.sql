/*
  Warnings:

  - Added the required column `delivery_ciphertext` to the `email_verification_tokens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `delivery_ciphertext` to the `password_reset_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "email_verification_tokens" ADD COLUMN     "delivery_ciphertext" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN     "delivery_ciphertext" TEXT NOT NULL;
