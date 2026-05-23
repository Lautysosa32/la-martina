export interface Product {
  id: string;
  name: string;
  brand: string;
  categoryId: string;
  price: number;
  originalPrice?: number | null;
  image: string;
  format?: string | null;
  isNew?: boolean;
  discount?: string | number | null;
  badge?: string | null; // like 'Local', 'Orgánico', '3x2'
  minStock?: number;
  barcode?: string | null; // EAN-13, EAN-8, UPC
  // DB-sourced fields (from product.types.Product via Supabase)
  stock?: number;
  branchId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  title: string;
  description: string;
}

export const categories: Category[] = [
  { id: 'almacen', title: 'Almacén', description: 'Productos esenciales para tu despensa.' },
  { id: 'bebidas', title: 'Bebidas', description: 'Variedad de bebidas para cada momento.' },
  { id: 'carnes', title: 'Carnes', description: 'Cortes seleccionados de primera calidad.' },
  { id: 'lacteos', title: 'Lácteos', description: 'Productos frescos cada día.' },
  { id: 'limpieza', title: 'Limpieza', description: 'Todo para dejar tu hogar impecable.' },
  { id: 'perfumeria', title: 'Perfumería', description: 'Cuidado personal y fragancias premium.' }
];

export const products: Product[] = [
  // Almacen
  {
    id: 'a1',
    categoryId: 'almacen',
    brand: 'Aceites y Vinagres',
    name: 'Aceite de Oliva Extra Virgen Premium Bodega 500ml',
    price: 8500,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBCrV53kTNQFOMjLyQpodBRngj15sTd7KLKovzSzXk0IwENvp5q-fhNp8JJ99ZgCbPlhJIMRcpGO36wfoZ9mTUzIy7tlBeEHz8_SOrOLyFelF0Acsai4NtG9LQu39nI5-1MY6uJyr9uxqehwQPuiaTJQJl3KXTSR4rFEIWp6SH-4O-2EB-u3RgMzMCfU7KIXJZ4iCpQB6la3ldAwDnPO4YF6s8VMZ_iYjGHsm-KGqJW-wdg_CERsR00y0iat92wt3VjrmfGVAdqAsza',
    format: ''
  },
  {
    id: 'a2',
    categoryId: 'almacen',
    brand: 'Arroz y Legumbres',
    name: 'Arroz Integral Orgánico Grano Largo 1kg',
    price: 2400,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCicSX4dAH_OuQvUdZW3U0zxebxm7e562npMkag6cAforP_TrqvJwCJUyVgv_BA7KHwkUG4ErrC8EQ-GRHfJDXH-b4__LdejrsVWrwMuXSmN0j763TOvGt0dBilw75lMzZx-jEFEkhm5ikRRXkA_NPPO7aycfImJRvcXVQ_yAIDQ0MKgqnzYp9L8h_lKJPlBOio5nNkPcZqsNBPM90CffLxTlRIvh61da_zY7hXSPD6MHXpmF1hj9pl9NR1YXRN65R5Sf9dnk4jdiYM',
    format: '',
    badge: 'Orgánico'
  },
  {
    id: 'a3',
    categoryId: 'almacen',
    brand: 'Pastas Secas',
    name: 'Fideos Spaghetti 500g',
    price: 1200,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDayNu_iol-JFTNzgI3S_oiIcSuazhN_4lbBad0GbUL1lTgyDa972ke7VNa3egNKD4tpncDWvSGmaR5OOC4zSGX5EQSJVjHQARaZZedgOA_vr2PemWdhn_Q2lihJOMFe-5c3UbaVsgtNQT67tJDacojoY7wWncL0mQIP72TNZqcgUmzsllgDfr3GNNkA9a0HugnKm3Kn3cfYna6D2nEYkv8gvrUFy6GvEO1bbjm3Egiq0HXTHnkYvUMkgxAD3534Nneh-U9aa9C4F6M',
    format: ''
  },
  
  // Bebidas
  {
    id: 'b1',
    categoryId: 'bebidas',
    brand: 'Bodega Premium',
    name: 'Vino Tinto Malbec Reserva 750ml',
    price: 4500,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAr450RbKa-bLjE3RF1uhpHr-zIbtDoKaLAbQ6Y6jxJEAA1xI1qJLHq-7ZyMu3GV154uFpncXCXM8aTitMtS-2BDZ2nA7UpAhTJ7TZYeg3YFPavcx-_4OuCRnWMprFa8B7_YM6CwaLbPGLa7RXGzh8uwxM387NmtNHCVe1heR9SEnJ5YDmamwsUpSqW8NiJblMMlRLHWMCHgHC5Lxg5NJpythFCt4UgYKls_1ySNj3sDAsT8m7vZcbCJ65a03zWPYtUTBCPP8g924GH',
    format: ''
  },
  {
    id: 'b2',
    categoryId: 'bebidas',
    brand: 'Clásica',
    name: 'Gaseosa Cola Regular Lata 354ml',
    price: 850,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBJTFOHCn-no2R4XbWgqwsvQVFh5aB6tMJuTEGA30QzoGeQZN9Q7ZQeLv0T9u2U4JvAgc3bJHBaKpCEt0f4qpgVq8xv-8hcqYw1S1tZlmf62eRLqRVQnIiOq4Ut9axf_YHqlhX9jBg_5WEjpBsofHVk3vBhnPnJbvafUWJwc7S2fT8YLvJy9HbvtAbaNKZWQCHBGmquIRt9l6hE1XuU6kNZ_5RZoufZxnPm01_nHblvxIPlkPdzS9WwR3NgtsW3SRZXvwjEtiwj7Vjm',
    format: '',
    badge: '3x2'
  },

  // Carnes
  {
    id: 'c1',
    categoryId: 'carnes',
    brand: 'Vacuno • 1kg',
    name: 'Asado de Tira Premium Envasado',
    price: 10200,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDzizBPRWaiIYf8iGpCCP5kaFBAKeYXSm-4q4wFqHemv45K4dchY9FY5LyRsYLRYHZ4QDxVoYh5uFC71kEKSlO5i_UigryWlAGVhUBwIvJHkzQ7_TYtzM1-TF16XNiWnBDo_wUmhKtTbaFeDm91tlqRMuqkH-11jQOYkA5VNra-CdebKj73-pvsS5vY5N7MPSifeaLJCGlxcqloOSW1ha-58BQCde8gt1BtGmQZfMR59DVlNbAUFAqnKFl7PupYyESmrpA3Ck1xFUs1',
    format: ''
  },
  {
    id: 'c2',
    categoryId: 'carnes',
    brand: 'Aves • 2kg',
    name: 'Pollo Entero Orgánico de Campo',
    price: 6800,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBYBluUgsfOw50P9bhI_LQM8Z5IyXW3qM5sOwq7iDKOWrTSa4epMXCK0ttGBj37pac-mRaXD76gfx1iRVS1YfbxzHFxkkDhhGvlSqch3uoIL034mjVf13_AIhxschtubZm7RloRqeiWOgfOzpjZSuwpEo-AilLjuF5MvRd-uxDenzZ9-czNiWhRaP3olqYcL2CkmJKFgS70SWr43z1yOL-fzIy1h1p8pIxHDSITR5igkT9FxqRUUSRzzsMzTWeDdr-aui2YsHkAoo2t',
    format: ''
  },
  
  // Limpieza
  {
    id: 'l1',
    categoryId: 'limpieza',
    brand: 'Cuidado de Ropa',
    name: 'Detergente Líquido Premium 3L',
    price: 10625,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTDe67ppq4qiYo3rMMYqdYDHenVxxXfmbJlkpZPH2LW-XGKTfT6Qn6x5BEyOCB15qsTJH4gQGHS5ih8qr4OueVlLzN85iqMJl7cm_9WpluHscSx6nLUMxRFlZh9p6LoLiIRBBPJA_Ouy5J9BRqQqO81V8qSEsHcU5ohXASBpNgrehh3vrTxYJl19AvvlAKbr6XuGyjNU55o26sx5W24BTPrn_S-bOeUphWjuiSao0QUEUMSqnMtErzAKOk6Qvgo46ZhpxsrFa_oJLw',
    format: ''
  },

  // Perfumería
  {
    id: 'p1',
    categoryId: 'perfumeria',
    brand: 'Pantene',
    name: 'Shampoo Restauración Pantene 400ml',
    price: 4500,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAi9nva07Gh8vRWAvgpYcAsiNocshmMI0lUUbENVkNUn0AVx2O2h1CcyNpBfsHWOjTHVtI09NScg_eYQiLgAF32YroD-PqVtw_LzXz42N05WNj38263IGvgtN_LB9ME8mQWwL0DYzRGUtW1uUG46Be9V_bK3QpXx_IyabE-GeR1T9hArEi_sox3OVmUOKFxXiEXbXR3akJOmYVr6aO2OnIH5s1Eo2FGzpnwj8Ehpq_GWnqR9L3scNk9hB8bN2Oh54iZsU9u--m2SGh2',
    format: ''
  },
  {
    id: 'p2',
    categoryId: 'perfumeria',
    brand: 'Nivea',
    name: 'Crema Facial Hidratante Nivea Q10 50ml',
    price: 12000,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCzZxncQ200rSe4lIW5oXxuS2WrW4sfBkkctqhO0JFOma7D_JKBTHhLX23XtKvTxtmg_dTptb7UjROiWl3sspLp28qAsnGX_tYNyLSu8eEkakv37UembY1UpBTzMJ8Eq1hEAXokN7-IN5GjctIrLx3-EHk2XpRCsbVqa8ywfi8qEp5qgUGHyUGJPLsCdlKH9M7xPP0NyTDmjEK2898tUbGM5mu2OtWNbsOqtoGZAGU4c9PEpo4f7nBJ8nzgPa8tggwqWjGsqrBi6HB7',
    format: ''
  },

  // Lacteos
  {
    id: 'la1',
    categoryId: 'lacteos',
    brand: 'Yogurísimo',
    name: 'Yogur Natural sin Azúcar Agregada 500g',
    price: 950,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC627gpthFSebyMA5Hsu9WnA0wG0oRhKg69AUKDqSeoaHMRJ9bNoWvkZP9yUt2zp_F4JD_SOaeL8Cg1DZvZk-difsqsJpXu7gDWMvU2zQC3BphBSR62lmruYBggY3rpCcAN94bQlggdfiRfnT2kLWrte_FmT3QQ3hXCM9NpT9homZ9f0NG2chvA6kwDfabpgycQVgR5Pt-FTxIJyvJ1myZRHfKOdaEJGHj8dLSCKd-HrBuNsycAauzOUEcqmWHbrozKaDZ-SNH3ytRb',
    format: ''
  },
  {
    id: 'la2',
    categoryId: 'lacteos',
    brand: 'La Paulina',
    name: 'Queso Cremoso Fraccionado 500g',
    price: 3500,
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDhoLvQhdzYkEMz9e6kfcjOhMGdtigjLwOq3i5HZ9F_Z9RcDc6IGmN_94NTjxcXvVM7e2yzHRmIR3VF1EWiEoiDBxMlScDv2K_4beXYktxj4a8QVo3nOqa_2MlfzLVl9c5k5fkjQd8RL14Qhod1asVvm9_WLOv112wBZyaQhDeWFIhFQdFCgbPU3-8R0t3TY6c_SRW905wgqAUQLfTH_C-Ha4a2y4g1tU7M_GO0JQiR1xGWjDsMB3l7D1dkjEKsLU6ZWl7zxRLEVJNH',
    format: ''
  }
];
