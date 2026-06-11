/**
 * Order Entity
 */
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface IOrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface IOrder {
  _id?: string;
  userId: string;
  items: IOrderItem[];
  total: number;
  status: OrderStatus;
  deliveryAddress?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
