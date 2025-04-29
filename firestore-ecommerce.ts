// src/app/firebase/models.ts
export interface FirestoreDocument {
  id: string;
}

export interface Product extends FirestoreDocument {
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  categories: string[];
  images: string[];
  stock: number;
  sku: string;
  featured?: boolean;
  attributes?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface User extends FirestoreDocument {
  email: string;
  firstName: string;
  lastName: string;
  address?: Address[];
  phone?: string;
  role: 'customer' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  isDefault?: boolean;
}

export interface Order extends FirestoreDocument {
  userId: string;
  items: OrderItem[];
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  totalAmount: number;
  shippingAddress: Address;
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  trackingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  totalPrice: number;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart extends FirestoreDocument {
  userId: string;
  items: CartItem[];
  updatedAt: Date;
}

export interface Review extends FirestoreDocument {
  userId: string;
  productId: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface Coupon extends FirestoreDocument {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minPurchase?: number;
  startDate: Date;
  endDate: Date;
  usageLimit?: number;
  usageCount: number;
  isActive: boolean;
}

// src/app/firebase/firestore-ecommerce.ts
import { 
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  startAt,
  endAt,
  getCountFromServer,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  WriteBatch,
  runTransaction,
  FirestoreError,
  QuerySnapshot
} from 'firebase/firestore';
import { db } from './firebase-config';
import { 
  FirestoreDocument, 
  Product, 
  User, 
  Order, 
  Cart, 
  Review,
  Coupon
} from './models';

// Tipos de error personalizados
export class FirestoreNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirestoreNotFoundError';
  }
}

export class FirestoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirestoreValidationError';
  }
}

/**
 * Utilidad avanzada para interactuar con Firestore en un e-commerce
 */
export const firestoreEcommerce = {
  /**
   * Utilidades de colecciones comunes
   */
  collections: {
    products: () => collection(db, 'products'),
    users: () => collection(db, 'users'),
    orders: () => collection(db, 'orders'),
    carts: () => collection(db, 'carts'),
    reviews: () => collection(db, 'reviews'),
    coupons: () => collection(db, 'coupons'),
  },

  /**
   * Obtiene una referencia a un documento
   */
  docRef: <T extends FirestoreDocument>(collectionName: string, id: string): DocumentReference => {
    return doc(db, collectionName, id);
  },

  /**
   * Obtiene todos los documentos de una colección con paginación
   * @param collectionName Nombre de la colección
   * @param pageSize Número de documentos por página
   * @param startAfterDoc Documento de inicio para paginación
   * @param constraints Restricciones adicionales
   * @returns Promise con array de documentos y el último documento para paginación
   */
  getPaginated: async <T extends FirestoreDocument>(
    collectionName: string,
    pageSize: number = 10,
    startAfterDoc?: DocumentSnapshot,
    constraints: QueryConstraint[] = []
  ): Promise<{
    items: T[];
    lastDoc: QueryDocumentSnapshot | null;
    hasMore: boolean;
  }> => {
    try {
      const collectionRef = collection(db, collectionName);
      let queryConstraints = [...constraints, limit(pageSize + 1)];
      
      if (startAfterDoc) {
        queryConstraints.push(startAfter(startAfterDoc));
      }
      
      const q = query(collectionRef, ...queryConstraints);
      const snapshot = await getDocs(q);
      
      const hasMore = snapshot.docs.length > pageSize;
      const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
      
      return {
        items: docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as T)),
        lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
        hasMore
      };
    } catch (error) {
      console.error(`Error al obtener documentos paginados de ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Obtiene el número total de documentos en una colección
   * @param collectionName Nombre de la colección
   * @param constraints Restricciones para filtrar el conteo
   * @returns Promise con el conteo
   */
  getCount: async (
    collectionName: string,
    constraints: QueryConstraint[] = []
  ): Promise<number> => {
    try {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, ...constraints);
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      console.error(`Error al obtener conteo de ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Obtiene todos los documentos de una colección
   * @param collectionName Nombre de la colección
   * @returns Promise con array de documentos
   */
  getAll: async <T extends FirestoreDocument>(collectionName: string): Promise<T[]> => {
    try {
      const collectionRef = collection(db, collectionName);
      const snapshot = await getDocs(collectionRef);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convertir los timestamps a Date
        ...(doc.data().createdAt && { createdAt: doc.data().createdAt.toDate() }),
        ...(doc.data().updatedAt && { updatedAt: doc.data().updatedAt.toDate() })
      } as T));
    } catch (error) {
      console.error(`Error al obtener documentos de ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Obtiene un documento por su ID
   * @param collectionName Nombre de la colección
   * @param id ID del documento
   * @returns Promise con el documento o null si no existe
   */
  getById: async <T extends FirestoreDocument>(collectionName: string, id: string): Promise<T | null> => {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          // Convertir los timestamps a Date
          ...(data.createdAt && { createdAt: data.createdAt.toDate() }),
          ...(data.updatedAt && { updatedAt: data.updatedAt.toDate() })
        } as T;
      }
      
      return null;
    } catch (error) {
      console.error(`Error al obtener documento ${id} de ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Añade un nuevo documento a la colección
   * @param collectionName Nombre de la colección
   * @param data Datos a guardar
   * @returns Promise con el ID del documento creado
   */
  add: async <T extends Omit<FirestoreDocument, 'id'>>(
    collectionName: string, 
    data: T
  ): Promise<string> => {
    try {
      const timestamp = serverTimestamp();
      const docData = {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      
      const collectionRef = collection(db, collectionName);
      const docRef = await addDoc(collectionRef, docData);
      return docRef.id;
    } catch (error) {
      console.error(`Error al añadir documento a ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Crea un documento con un ID específico
   * @param collectionName Nombre de la colección
   * @param id ID del documento
   * @param data Datos a guardar
   */
  create: async <T extends Omit<FirestoreDocument, 'id'>>(
    collectionName: string,
    id: string,
    data: T
  ): Promise<void> => {
    try {
      const timestamp = serverTimestamp();
      const docData = {
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      
      const docRef = doc(db, collectionName, id);
      await setDoc(docRef, docData);
    } catch (error) {
      console.error(`Error al crear documento ${id} en ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Actualiza un documento existente
   * @param collectionName Nombre de la colección
   * @param id ID del documento
   * @param data Datos a actualizar
   */
  update: async (
    collectionName: string, 
    id: string, 
    data: Partial<FirestoreDocument>
  ): Promise<void> => {
    try {
      const docRef = doc(db, collectionName, id);
      
      // Asegurarse de que el documento existe antes de actualizarlo
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new FirestoreNotFoundError(`Documento ${id} no encontrado en ${collectionName}`);
      }
      
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Error al actualizar documento ${id} de ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Elimina un documento
   * @param collectionName Nombre de la colección
   * @param id ID del documento
   */
  delete: async (collectionName: string, id: string): Promise<void> => {
    try {
      const docRef = doc(db, collectionName, id);
      
      // Asegurarse de que el documento existe antes de eliminarlo
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new FirestoreNotFoundError(`Documento ${id} no encontrado en ${collectionName}`);
      }
      
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error al eliminar documento ${id} de ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Realiza una consulta personalizada
   * @param collectionName Nombre de la colección
   * @param constraints Restricciones de la consulta (where, orderBy, limit, etc.)
   * @returns Promise con array de documentos
   */
  query: async <T extends FirestoreDocument>(
    collectionName: string, 
    constraints: QueryConstraint[]
  ): Promise<T[]> => {
    try {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, ...constraints);
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Convertir los timestamps a Date
          ...(data.createdAt && { createdAt: data.createdAt.toDate() }),
          ...(data.updatedAt && { updatedAt: data.updatedAt.toDate() })
        } as T;
      });
    } catch (error) {
      console.error(`Error al consultar ${collectionName}:`, error);
      throw error;
    }
  },

  /**
   * Crea un batch para operaciones masivas
   */
  createBatch: (): WriteBatch => {
    return writeBatch(db);
  },

  /**
   * Ejecuta una transacción
   * @param updateFunction Función de actualización
   */
  runTransaction: async <T>(
    updateFunction: (transaction: Transaction) => Promise<T>
  ): Promise<T> => {
    return runTransaction(db, updateFunction);
  },

  /**
   * Funciones específicas para e-commerce
   */
  ecommerce: {
    /**
     * Productos
     */
    products: {
      /**
       * Obtiene productos con filtros comunes para e-commerce
       */
      getProducts: async (options: {
        category?: string;
        minPrice?: number;
        maxPrice?: number;
        featured?: boolean;
        sortBy?: 'price' | 'name' | 'createdAt';
        sortDirection?: 'asc' | 'desc';
        page?: number;
        limit?: number;
      }): Promise<{
        products: Product[];
        total: number;
        pages: number;
        currentPage: number;
        hasMore: boolean;
        lastDoc: QueryDocumentSnapshot | null;
      }> => {
        try {
          const {
            category,
            minPrice,
            maxPrice,
            featured,
            sortBy = 'createdAt',
            sortDirection = 'desc',
            page = 1,
            limit: pageSize = 10
          } = options;
          
          const constraints: QueryConstraint[] = [];
          
          // Aplicar filtros
          if (category) {
            constraints.push(where('categories', 'array-contains', category));
          }
          
          if (minPrice !== undefined) {
            constraints.push(where('price', '>=', minPrice));
          }
          
          if (maxPrice !== undefined) {
            constraints.push(where('price', '<=', maxPrice));
          }
          
          if (featured !== undefined) {
            constraints.push(where('featured', '==', featured));
          }
          
          // Ordenación
          constraints.push(orderBy(sortBy, sortDirection));
          
          // Obtener el conteo total para la paginación
          const total = await firestoreEcommerce.getCount('products', constraints);
          const pages = Math.ceil(total / pageSize);
          
          // Si estamos más allá de la primera página, necesitamos el cursor
          let startAfterDoc: DocumentSnapshot | undefined;
          if (page > 1) {
            // Obtener el último documento de la página anterior
            const prevPageQuery = query(
              collection(db, 'products'),
              ...constraints,
              limit((page - 1) * pageSize)
            );
            const prevPageSnapshot = await getDocs(prevPageQuery);
            const docs = prevPageSnapshot.docs;
            if (docs.length > 0) {
              startAfterDoc = docs[docs.length - 1];
            }
          }
          
          // Obtener los productos paginados
          const result = await firestoreEcommerce.getPaginated<Product>(
            'products',
            pageSize,
            startAfterDoc,
            constraints
          );
          
          return {
            products: result.items,
            total,
            pages,
            currentPage: page,
            hasMore: result.hasMore,
            lastDoc: result.lastDoc
          };
        } catch (error) {
          console.error('Error al obtener productos:', error);
          throw error;
        }
      },
      
      /**
       * Actualiza el stock de un producto
       */
      updateStock: async (
        productId: string, 
        quantity: number, 
        operation: 'increment' | 'decrement' | 'set' = 'set'
      ): Promise<void> => {
        try {
          const productRef = doc(db, 'products', productId);
          
          // Verificar que el producto existe
          const productSnap = await getDoc(productRef);
          if (!productSnap.exists()) {
            throw new FirestoreNotFoundError(`Producto ${productId} no encontrado`);
          }
          
          let updateData: Partial<Product> = {};
          
          if (operation === 'increment') {
            updateData = { 
              stock: increment(quantity),
              updatedAt: serverTimestamp()
            };
          } else if (operation === 'decrement') {
            // Verificar stock disponible
            const currentStock = productSnap.data().stock || 0;
            if (currentStock < quantity) {
              throw new FirestoreValidationError(`Stock insuficiente para el producto ${productId}`);
            }
            
            updateData = { 
              stock: increment(-quantity),
              updatedAt: serverTimestamp()
            };
          } else {
            updateData = { 
              stock: quantity,
              updatedAt: serverTimestamp()
            };
          }
          
          await updateDoc(productRef, updateData);
        } catch (error) {
          console.error(`Error al actualizar stock del producto ${productId}:`, error);
          throw error;
        }
      },
      
      /**
       * Busca productos por texto
       * Nota: Para búsquedas más avanzadas considera usar Algolia o una solución similar
       */
      search: async (searchTerm: string, limit: number = 10): Promise<Product[]> => {
        try {
          // Firestore no tiene búsqueda de texto nativa avanzada
          // Esta es una implementación básica con limitaciones
          const nameQuery = query(
            collection(db, 'products'),
            where('name', '>=', searchTerm),
            where('name', '<=', searchTerm + '\uf8ff'),
            limit(limit)
          );
          
          const nameSnapshot = await getDocs(nameQuery);
          
          // Convertir a Products
          return nameSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate()
            } as Product;
          });
        } catch (error) {
          console.error(`Error al buscar productos con término "${searchTerm}":`, error);
          throw error;
        }
      }
    },
    
    /**
     * Usuarios
     */
    users: {
      /**
       * Obtiene un usuario por su email
       */
      getByEmail: async (email: string): Promise<User | null> => {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', email), limit(1));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            return null;
          }
          
          const doc = snapshot.docs[0];
          const data = doc.data();
          
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate()
          } as User;
        } catch (error) {
          console.error(`Error al obtener usuario por email ${email}:`, error);
          throw error;
        }
      },
      
      /**
       * Añade una dirección a un usuario
       */
      addAddress: async (userId: string, address: Address): Promise<void> => {
        try {
          const userRef = doc(db, 'users', userId);
          
          // Verificar que el usuario existe
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            throw new FirestoreNotFoundError(`Usuario ${userId} no encontrado`);
          }
          
          // Si es dirección por defecto, actualizar las otras direcciones
          if (address.isDefault) {
            await runTransaction(db, async (transaction) => {
              const userDoc = await transaction.get(userRef);
              
              if (!userDoc.exists()) {
                throw new FirestoreNotFoundError(`Usuario ${userId} no encontrado`);
              }
              
              const userData = userDoc.data();
              const addresses = userData.address || [];
              
              // Marcar todas las direcciones como no predeterminadas
              const updatedAddresses = addresses.map((addr: Address) => ({
                ...addr,
                isDefault: false
              }));
              
              // Añadir la nueva dirección
              updatedAddresses.push(address);
              
              transaction.update(userRef, {
                address: updatedAddresses,
                updatedAt: serverTimestamp()
              });
            });
          } else {
            // Simplemente añadir la dirección
            await updateDoc(userRef, {
              address: arrayUnion(address),
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error(`Error al añadir dirección para usuario ${userId}:`, error);
          throw error;
        }
      }
    },
    
    /**
     * Pedidos
     */
    orders: {
      /**
       * Crea un nuevo pedido y actualiza el inventario
       */
      createOrder: async (orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
        try {
          // Crear el pedido usando una transacción para asegurar consistencia con el inventario
          const orderId = await runTransaction(db, async (transaction) => {
            // Verificar y actualizar inventario de cada producto
            for (const item of orderData.items) {
              const productRef = doc(db, 'products', item.productId);
              const productDoc = await transaction.get(productRef);
              
              if (!productDoc.exists()) {
                throw new FirestoreNotFoundError(`Producto ${item.productId} no encontrado`);
              }
              
              const productData = productDoc.data();
              const currentStock = productData.stock || 0;
              
              if (currentStock < item.quantity) {
                throw new FirestoreValidationError(`Stock insuficiente para ${productData.name}`);
              }
              
              // Decrementar stock
              transaction.update(productRef, {
                stock: increment(-item.quantity),
                updatedAt: serverTimestamp()
              });
            }
            
            // Crear el pedido
            const orderRef = doc(collection(db, 'orders'));
            transaction.set(orderRef, {
              ...orderData,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            
            // Limpiar el carrito si existe
            if (orderData.userId) {
              const cartQuery = query(
                collection(db, 'carts'),
                where('userId', '==', orderData.userId),
                limit(1)
              );
              
              const cartSnapshot = await getDocs(cartQuery);
              if (!cartSnapshot.empty) {
                const cartDoc = cartSnapshot.docs[0];
                transaction.update(doc(db, 'carts', cartDoc.id), {
                  items: [],
                  updatedAt: serverTimestamp()
                });
              }
            }
            
            return orderRef.id;
          });
          
          return orderId;
        } catch (error) {
          console.error('Error al crear pedido:', error);
          throw error;
        }
      },
      
      /**
       * Actualiza el estado de un pedido
       */
      updateOrderStatus: async (
        orderId: string, 
        status: Order['status'],
        trackingNumber?: string
      ): Promise<void> => {
        try {
          const orderRef = doc(db, 'orders', orderId);
          
          // Verificar que el pedido existe
          const orderSnap = await getDoc(orderRef);
          if (!orderSnap.exists()) {
            throw new FirestoreNotFoundError(`Pedido ${orderId} no encontrado`);
          }
          
          const updateData: Partial<Order> = {
            status,
            updatedAt: serverTimestamp() as any
          };
          
          if (trackingNumber) {
            updateData.trackingNumber = trackingNumber;
          }
          
          await updateDoc(orderRef, updateData);
        } catch (error) {
          console.error(`Error al actualizar estado del pedido ${orderId}:`, error);
          throw error;
        }
      },
      
      /**
       * Obtiene los pedidos de un usuario
       */
      getUserOrders: async (userId: string): Promise<Order[]> => {
        try {
          const ordersRef = collection(db, 'orders');
          const q = query(
            ordersRef,
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
          );
          
          const snapshot = await getDocs(q);
          
          return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate()
            } as Order;
          });
        } catch (error) {
          console.error(`Error al obtener pedidos del usuario ${userId}:`, error);
          throw error;
        }
      },
      
      /**
       * Cancela un pedido y restaura el inventario
       */
      cancelOrder: async (orderId: string): Promise<void> => {
        try {
          await runTransaction(db, async (transaction) => {
            const orderRef = doc(db, 'orders', orderId);
            const orderDoc = await transaction.get(orderRef);
            
            if (!orderDoc.exists()) {
              throw new FirestoreNotFoundError(`Pedido ${orderId} no encontrado`);
            }
            
            const orderData = orderDoc.data() as Order;
            
            // Verificar si el pedido ya está cancelado
            if (orderData.status === 'cancelled') {
              return;
            }
            
            // Verificar si el pedido está en un estado que permite cancelación
            if (!['pending', 'processing'].includes(orderData.status)) {
              throw new FirestoreValidationError(`No se puede cancelar un pedido en estado ${orderData.status}`);
            }
            
            // Restaurar inventario
            for (const item of orderData.items) {
              const productRef = doc(db, 'products', item.productId);
              const productDoc = await transaction.get(productRef);
              
              if (productDoc.exists()) {
                transaction.update(productRef, {
                  stock: increment(item.quantity),
                  updatedAt: serverTimestamp()
                });
              }
            }
            
            // Actualizar estado del pedido
            transaction.update(orderRef, {
              status: 'cancelled',
              updatedAt: serverTimestamp()
            });
          });
        } catch (error) {
          console.error(`Error al cancelar pedido ${orderId}:`, error);
          throw error;
        }
      }
    },
    
    /**
     * Carritos
     */
    carts: {
      /**
       * Obtiene el carrito de un usuario
       */
      getUserCart: async (userId: string): Promise<Cart | null> => {
        try {
          const cartsRef = collection(db, 'carts');
          const q = query(cartsRef, where('userId', '==', userId), limit(1));
          
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            return null;
          }
          
          const doc = snapshot.docs[0];
          const data = doc.data();
          
          return {
            id: doc.id,
            ...data,
            updatedAt: data.updatedAt?.toDate()
          } as Cart;
        } catch (error) {
          console.error(`Error al obtener carrito del usuario ${userId}:`, error);
          throw error;
        }
      },
      
      /**
       * Añade un producto al carrito
       */
      addToCart: async (
        userId: string, 
        productId: string, 
        quantity: number
      ): Promise<void> => {
        try {
          await runTransaction(db, async (transaction) => {
            // Verificar stock del producto
            const productRef = doc(db, 'products', productId);
            const productDoc = await transaction.get(productRef);
            
            if (!productDoc.exists()) {
              throw new FirestoreNotFoundError(`Producto ${productId} no encontrado`);
            }
            
            const productData = productDoc.data();
            if (productData.stock < quantity) {
              throw new FirestoreValidationError(`Stock insuficiente para el producto ${productId}`);
            }
            
            // Buscar o crear el carrito del usuario
            const cartsRef = collection(db, 'carts');
            const cartQuery = query(cartsRef, where('userId', '==', userId), limit(1));
            const cartSnapshot = await getDocs(cartQuery);
            
            let cartRef: DocumentReference;
            let existingItems: CartItem[] = [];
            
            if (cartSnapshot.empty) {
              // Crear un nuevo carrito
              cartRef = doc(collection(db, 'carts'));
            } else {
              // Usar el carrito existente
              const cartDoc = cartSnapshot.docs[0];
              cartRef = doc(db, 'carts', cartDoc.id);
              existingItems = cartDoc.data().items || [];
            }
            
            // Verificar si el producto ya está en el carrito
            const itemIndex = existingItems.findIndex(item => item.productId === productId);
            
            if (itemIndex >= 0) {
              // Actualizar cantidad del producto existente
              existingItems[itemIndex].quantity += quantity;
            } else {
              // Añadir nuevo producto
              existingItems.push({
                productId,
                quantity
              });
            }
            
            // Guardar carrito
            transaction.set(cartRef, {
              userId,
              items: existingItems,
              updatedAt: serverTimestamp()
            }, { merge: true });
          });
        } catch (error) {
          console.error(`Error al añadir producto ${productId} al carrito del usuario ${userId}:`, error);
          throw error;
        }
      },
      
      /**
       * Actualiza la cantidad de un producto en el carrito
       */
      updateCartItem: async (
        userId: string,
        productId: string,
        quantity: number
      ): Promise<void> => {
        try {
          await runTransaction(db, async (transaction) => {
            // Verificar stock del producto si es necesario
            if (quantity > 0) {
              const productRef = doc(db, 'products', productId);
              const productDoc = await transaction.get(productRef);
              
              if (!productDoc.exists()) {
                throw new FirestoreNotFoundError(`Producto ${productId} no encontrado`);
              }
              
              const productData = productDoc.data();
              if (productData.stock < quantity) {
                throw new FirestoreValidationError(`Stock insuficiente para el producto ${productId}`);
              }
            }
            
            // Buscar el carrito
            const cartsRef = collection(db, 'carts');
            const cartQuery = query(cartsRef, where('userId', '==', userId), limit(1));
            const cartSnapshot = await getDocs(cartQuery);
            
            if (cartSnapshot.empty) {
              throw new FirestoreNotFoundError(`Carrito no encontrado para el usuario ${userId}`);
            }
            
            const cartDoc = cartSnapshot.docs[0];
            const cartRef = doc(db, 'carts', cartDoc.id);
            const existingItems = cartDoc.data().items || [];
            
            // Encontrar y actualizar el producto
            const updatedItems = existingItems.filter(item => item.productId !== productId);
            
            // Si la cantidad es mayor que cero, añadir el producto actualizado
            if (quantity > 0) {
              updatedItems.push({
                productId,
                quantity
              });
            }
            
            // Actualizar carrito
            transaction.update(cartRef, {
              items: updatedItems,
              updatedAt: serverTimestamp()
            });
          });
        } catch (error) {
          console.error(`Error al actualizar producto ${productId} en el carrito del usuario ${userId}:`, error);
          throw error;
        }
      },
      
      /**
       * Elimina un producto del carrito
       */
      removeFromCart: async (userId: string, productId: string): Promise<void> => {
        try {
          const cartsRef = collection(db, 'carts');
          const q = query(cartsRef, where('userId', '==', userId), limit(1));
          
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            const cartDoc = snapshot.docs[0];
            const existingItems = cartDoc.data().items || [];
            
            // Filtrar el producto a eliminar
            const updatedItems = existingItems.filter(item => item.productId !== productId);
            
            await updateDoc(doc(db, 'carts', cartDoc.id), {
              items: updatedItems,
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error(`Error al eliminar producto ${productId} del carrito del usuario ${userId}:`, error);
          throw error;
        }
      },
      
      /**
       * Vacía el carrito
       */
      clearCart: async (userId: string): Promise<void> => {
        try {
          const cartsRef = collection(db, 'carts');
          const q = query(cartsRef, where('userId', '==', userId), limit(1));
          
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            const cartDoc = snapshot.docs[0];
            
            await updateDoc(doc(db, 'carts', cartDoc.id), {
              items: [],
              updatedAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error(`Error al vaciar carrito del usuario ${userId}:`, error);
          throw error;
        }
      }
    },
    
    /**
     * Reseñas de productos
     */
    reviews: {
      /**
       * Añade una reseña para un producto
       */
      addReview: async (review: Omit<Review, 'id' | 'createdAt'>): Promise<string> => {
        try {
          // Verificar que el producto existe
          const productRef = doc(db, 'products', review.productId);
          const productSnap = await getDoc(productRef);
          
          if (!productSnap.exists()) {
            throw new FirestoreNotFoundError(`Producto ${review.productId} no encontrado`);
          }
          
          // Verificar si el usuario ya ha dejado una reseña para este producto
          const reviewsRef = collection(db, 'reviews');
          const q = query(
            reviewsRef,
            where('userId', '==', review.userId),
            where('productId', '==', review.productId),
            limit(1)
          );
          
          const existingReviews = await getDocs(q);
          
          if (!existingReviews.empty) {
            throw new FirestoreValidationError(`El usuario ya ha dejado una reseña para este producto`);
          }
          
          // Añadir la reseña
          const reviewData = {
            ...review,
            createdAt: serverTimestamp()
          };
          
          const reviewDocRef = await addDoc(reviewsRef, reviewData);
          
          // Actualizar las estadísticas de reseñas del producto (opcional)
          // Esto podría hacerse con una cloud function o un trabajo en lote
          
          return reviewDocRef.id;
        } catch (error) {
          console.error(`Error al añadir reseña para producto ${review.productId}:`, error);
          throw error;
        }
      },
      
      /**
       * Obtiene las reseñas de un producto
       */
      getProductReviews: async (
        productId: string,
        limit: number = 10,
        startAfterDoc?: DocumentSnapshot
      ): Promise<{
        reviews: Review[];
        lastDoc: QueryDocumentSnapshot | null;
        hasMore: boolean;
      }> => {
        try {
          // Crear la consulta base
          const reviewsRef = collection(db, 'reviews');
          let constraints: QueryConstraint[] = [
            where('productId', '==', productId),
            orderBy('createdAt', 'desc'),
            limit(limit + 1)
          ];
          
          if (startAfterDoc) {
            constraints.push(startAfter(startAfterDoc));
          }
          
          const q = query(reviewsRef, ...constraints);
          const snapshot = await getDocs(q);
          
          // Determinar si hay más resultados
          const hasMore = snapshot.docs.length > limit;
          const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;
          
          // Convertir a Review
          const reviews = docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate()
            } as Review;
          });
          
          return {
            reviews,
            lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
            hasMore
          };
        } catch (error) {
          console.error(`Error al obtener reseñas para producto ${productId}:`, error);
          throw error;
        }
      },
      
      /**
       * Obtiene el promedio de valoraciones de un producto
       */
      getProductRatingAverage: async (productId: string): Promise<{
        average: number;
        count: number;
      }> => {
        try {
          const reviewsRef = collection(db, 'reviews');
          const q = query(reviewsRef, where('productId', '==', productId));
          
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            return { average: 0, count: 0 };
          }
          
          let sum = 0;
          snapshot.docs.forEach(doc => {
            sum += doc.data().rating || 0;
          });
          
          return {
            average: sum / snapshot.docs.length,
            count: snapshot.docs.length
          };
        } catch (error) {
          console.error(`Error al obtener promedio de valoraciones para producto ${productId}:`, error);
          throw error;
        }
      }
    },
    
    /**
     * Cupones
     */
    coupons: {
      /**
       * Valida un cupón
       */
      validateCoupon: async (
        code: string,
        totalAmount: number
      ): Promise<{
        valid: boolean;
        coupon?: Coupon;
        errorMessage?: string;
      }> => {
        try {
          // Obtener el cupón
          const couponsRef = collection(db, 'coupons');
          const q = query(
            couponsRef,
            where('code', '==', code),
            where('isActive', '==', true),
            limit(1)
          );
          
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            return {
              valid: false,
              errorMessage: 'Cupón no encontrado o inactivo'
            };
          }
          
          const doc = snapshot.docs[0];
          const data = doc.data();
          
          const coupon: Coupon = {
            id: doc.id,
            ...data,
            startDate: data.startDate.toDate(),
            endDate: data.endDate.toDate()
          };
          
          // Verificar fecha de validez
          const now = new Date();
          if (now < coupon.startDate || now > coupon.endDate) {
            return {
              valid: false,
              errorMessage: 'Cupón expirado o aún no válido'
            };
          }
          
          // Verificar límite de uso
          if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            return {
              valid: false,
              errorMessage: 'Cupón ha alcanzado su límite de uso'
            };
          }
          
          // Verificar monto mínimo
          if (coupon.minPurchase && totalAmount < coupon.minPurchase) {
            return {
              valid: false,
              errorMessage: `Monto mínimo de compra no alcanzado. Requiere ${coupon.minPurchase}`
            };
          }
          
          return {
            valid: true,
            coupon
          };
        } catch (error) {
          console.error(`Error al validar cupón ${code}:`, error);
          throw error;
        }
      },
      
      /**
       * Aplica un cupón (incrementa su contador de uso)
       */
      applyCoupon: async (code: string): Promise<void> => {
        try {
          // Obtener el cupón
          const couponsRef = collection(db, 'coupons');
          const q = query(
            couponsRef,
            where('code', '==', code),
            where('isActive', '==', true),
            limit(1)
          );
          
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            const couponDoc = snapshot.docs[0];
            
            await updateDoc(doc(db, 'coupons', couponDoc.id), {
              usageCount: increment(1)
            });
          }
        } catch (error) {
          console.error(`Error al aplicar cupón ${code}:`, error);
          throw error;
        }
      }
    },
    
    /**
     * Estadísticas y reportes
     */
    statistics: {
      /**
       * Obtiene estadísticas de ventas por período
       */
      getSalesStats: async (
        startDate: Date,
        endDate: Date
      ): Promise<{
        totalSales: number;
        orderCount: number;
        averageOrderValue: number;
      }> => {
        try {
          const ordersRef = collection(db, 'orders');
          const q = query(
            ordersRef,
            where('createdAt', '>=', startDate),
            where('createdAt', '<=', endDate),
            where('status', 'in', ['processing', 'shipped', 'delivered'])
          );
          
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            return {
              totalSales: 0,
              orderCount: 0,
              averageOrderValue: 0
            };
          }
          
          let totalSales = 0;
          snapshot.docs.forEach(doc => {
            totalSales += doc.data().totalAmount || 0;
          });
          
          return {
            totalSales,
            orderCount: snapshot.docs.length,
            averageOrderValue: totalSales / snapshot.docs.length
          };
        } catch (error) {
          console.error('Error al obtener estadísticas de ventas:', error);
          throw error;
        }
      },
      
      /**
       * Obtiene productos más vendidos
       */
      getTopSellingProducts: async (
        limit: number = 10
      ): Promise<Array<{
        productId: string;
        productName: string;
        totalQuantity: number;
        totalSales: number;
      }>> => {
        try {
          // Nota: Esta función es una simplificación
          // En un entorno de producción, podrías usar Cloud Functions para mantener
          // estas estadísticas actualizadas en tiempo real
          
          const ordersRef = collection(db, 'orders');
          const q = query(
            ordersRef,
            where('status', 'in', ['processing', 'shipped', 'delivered'])
          );
          
          const snapshot = await getDocs(q);
          
          // Mapeo para contabilizar ventas por producto
          const productMap = new Map<string, {
            productId: string;
            productName: string;
            totalQuantity: number;
            totalSales: number;
          }>();
          
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const items = data.items || [];
            
            items.forEach((item: OrderItem) => {
              const productId = item.productId;
              const existing = productMap.get(productId) || {
                productId,
                productName: item.productName,
                totalQuantity: 0,
                totalSales: 0
              };
              
              existing.totalQuantity += item.quantity;
              existing.totalSales += item.totalPrice;
              
              productMap.set(productId, existing);
            });
          });
          
          // Convertir a array y ordenar
          const results = Array.from(productMap.values())
            .sort((a, b) => b.totalQuantity - a.totalQuantity)
            .slice(0, limit);
          
          return results;
        } catch (error) {
          console.error('Error al obtener productos más vendidos:', error);
          throw error;
        }
      },
      
      /**
       * Obtiene productos con poco stock
       */
      getLowStockProducts: async (threshold: number = 5): Promise<Product[]> => {
        try {
          const productsRef = collection(db, 'products');
          const q = query(
            productsRef,
            where('stock', '<=', threshold),
            orderBy('stock', 'asc')
          );
          
          const snapshot = await getDocs(q);
          
          return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate()
            } as Product;
          });
        } catch (error) {
          console.error(`Error al obtener productos con poco stock:`, error);
          throw error;
        }
      }
    }
  },
  
  /**
   * Helpers para construir consultas
   */
  queryBuilder: {
    where,
    orderBy,
    limit,
    startAfter,
    endBefore,
    startAt,
    endAt
  }
};

// Exportamos las utilidades y módulos específicos para que sean fácilmente consumibles
export const { 
  getAll, 
  getById, 
  getPaginated,
  getCount,
  add, 
  create,
  update, 
  delete: deleteDocument, 
  query, 
  createBatch,
  runTransaction,
  queryBuilder,
  collections,
  docRef,
  ecommerce
} = firestoreEcommerce;
