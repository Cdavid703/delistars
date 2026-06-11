/**
 * Cart DTOs
 */
export class AddToCartDto {
  productId!: string;
  quantity!: number;
}

export class UpdateCartDto {
  items!: Array<{
    productId: string;
    quantity: number;
  }>;
}
