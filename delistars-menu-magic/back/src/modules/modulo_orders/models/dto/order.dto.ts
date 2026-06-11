/**
 * Order DTOs
 */
export class CreateOrderDto {
  items!: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  total!: number;
  deliveryAddress?: string;
  notes?: string;
}

export class UpdateOrderStatusDto {
  status!: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
}
