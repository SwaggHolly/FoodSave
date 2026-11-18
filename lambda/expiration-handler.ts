import { DynamoDBFoodSaveRepository } from './src/adapters/output/database/dynamodb-foodsave-repository.js';

const repository = new DynamoDBFoodSaveRepository();

export async function handler(): Promise<{ expiredReservations: number }> {
  const expiredReservations = await repository.expirePendingOrders(new Date());
  console.info('Se liberaron reservas de pago vencidas.', { expiredReservations });
  return { expiredReservations };
}
