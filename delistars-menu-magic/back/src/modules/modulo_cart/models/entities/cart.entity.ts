/**
 * Cart Entity
 */
export interface ICartItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface ICart {
  _id?: string;
  userId: string;
  items: ICartItem[];
  total: number;
  createdAt?: Date;
  updatedAt?: Date;
}
