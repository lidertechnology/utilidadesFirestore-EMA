He creado una utilidad de Firestore mucho más completa y orientada a necesidades de e-commerce. Vamos a repasar las principales características y mejoras:

## Características principales

1. **Modelos definidos para entidades de e-commerce**:
   - Productos con atributos completos (precio, stock, categorías, SKU, etc.)
   - Usuarios con direcciones
   - Pedidos con líneas de pedido y estados de seguimiento
   - Carritos de compra
   - Reseñas de productos
   - Cupones y descuentos

2. **Operaciones CRUD mejoradas**:
   - Mejor manejo de fechas (createdAt/updatedAt) con timestamps
   - Conversión automática entre Timestamp de Firestore y Date de JavaScript
   - Validaciones para evitar operaciones inválidas

3. **Funcionalidades específicas para e-commerce**:
   - **Productos**: búsqueda, filtros, paginación, control de inventario
   - **Carritos**: gestión completa (añadir, actualizar, eliminar, vaciar)
   - **Pedidos**: creación atómica con actualización de inventario, cancelación, seguimiento
   - **Usuarios**: gestión de direcciones, múltiples perfiles
   - **Reseñas**: valoraciones de productos con puntuación
   - **Cupones**: validación, aplicación y límites de uso

4. **Características avanzadas**:
   - **Transacciones**: para operaciones que requieren consistencia (como crear pedidos)
   - **Paginación**: para grandes colecciones de productos
   - **Consultas complejas**: con varios filtros combinados
   - **Estadísticas**: ventas, productos más vendidos, productos con poco stock
   - **Manejo de errores**: con tipos específicos para diferentes situaciones

## ¿Cómo usar esta utilidad?

### Para productos

```typescript
// Obtener productos con filtros
const result = await ecommerce.products.getProducts({
  category: 'electronics',
  minPrice: 100,
  maxPrice: 500,
  featured: true,
  sortBy: 'price',
  sortDirection: 'asc',
  page: 1,
  limit: 20
});

// Actualizar stock
await ecommerce.products.updateStock('product123', 5, 'decrement');

// Buscar productos
const searchResults = await ecommerce.products.search('smartphone');
```

### Para carritos

```typescript
// Añadir al carrito
await ecommerce.carts.addToCart('user123', 'product456', 2);

// Obtener carrito de usuario
const cart = await ecommerce.carts.getUserCart('user123');

// Actualizar cantidad
await ecommerce.carts.updateCartItem('user123', 'product456', 3);
```

### Para pedidos

```typescript
// Crear pedido (con transacción que actualiza stock)
const orderId = await ecommerce.orders.createOrder({
  userId: 'user123',
  items: [{
    productId: 'product456',
    productName: 'Smartphone XYZ',
    quantity: 1,
    price: 499,
    totalPrice: 499
  }],
  status: 'pending',
  totalAmount: 499,
  shippingAddress: {
    street: 'Calle Principal 123',
    city: 'Madrid',
    state: 'Madrid',
    country: 'España',
    zipCode: '28001'
  },
  paymentMethod: 'credit_card',
  paymentStatus: 'pending'
});

// Actualizar estado del pedido
await ecommerce.orders.updateOrderStatus('order789', 'shipped', 'ABC123456');

// Cancelar pedido (restaurando inventario)
await ecommerce.orders.cancelOrder('order789');
```

### Para reseñas y cupones

```typescript
// Añadir reseña
await ecommerce.reviews.addReview({
  userId: 'user123',
  productId: 'product456',
  rating: 4.5,
  comment: 'Excelente producto, muy satisfecho con la compra'
});

// Validar un cupón
const couponResult = await ecommerce.coupons.validateCoupon('SUMMER20', 150);
if (couponResult.valid) {
  // Aplicar descuento
  await ecommerce.coupons.applyCoupon('SUMMER20');
}
```

### Para estadísticas

```typescript
// Obtener estadísticas de ventas
const salesStats = await ecommerce.statistics.getSalesStats(
  new Date('2024-01-01'),
  new Date('2024-04-30')
);

// Productos más vendidos
const topProducts = await ecommerce.statistics.getTopSellingProducts(5);

// Productos con poco stock
const lowStockProducts = await ecommerce.statistics.getLowStockProducts(10);
```

## Beneficios clave

1. **Consistencia de datos**: Usando transacciones para operaciones críticas como crear pedidos.
2. **Optimización de rendimiento**: Con paginación para grandes colecciones.
3. **Control de inventario**: Evitando ventas de productos sin stock.
4. **Extensibilidad**: Estructura modular fácil de ampliar con nuevas funcionalidades.
5. **Tipado fuerte**: Usando TypeScript para evitar errores comunes.

Esta utilidad cubre todo el ciclo de vida de un e-commerce, desde la navegación por catálogos hasta la finalización de compras, y es fácilmente extensible para adaptarse a necesidades específicas de tu proyecto.
