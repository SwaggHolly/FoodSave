import { DynamoDBFoodSaveRepository } from './src/adapters/output/database/dynamodb-foodsave-repository.js';

const repository = new DynamoDBFoodSaveRepository();

export async function handler(): Promise<{ expiredReservations: number; deletedVegetables: number }> {
  const now = new Date();
  const expiredReservations = await repository.expirePendingOrders(now);
  const deletedVegetables = await repository.deleteExpiredVegetables(now);
  console.info('Se liberaron reservas vencidas.', { expiredReservations });
  console.info('Se eliminaron verduras antiguas.', { deletedVegetables });
  return { expiredReservations, deletedVegetables };
}
