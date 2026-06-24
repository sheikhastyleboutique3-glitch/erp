/**
 * GWK V8 — Full Demo Seed
 *
 * Covers every module with realistic data:
 *   • 3 branches (warehouse + 2 restaurant branches)
 *   • 4 units, 8 categories, 4 suppliers
 *   • 20 products (with allergens on relevant items)
 *   • 10 users (all 8 roles, Arabic names, bilingual)
 *   • Inventory at all 3 locations
 *   • 12 requisitions covering every workflow status
 *   • Dispatch records with driver/recipient details
 *   • 8 purchase orders (all statuses)
 *   • Supplier price history
 *   • 10 wastage records (all 6 reasons)
 *   • 6 alerts (low stock + expiry)
 *   • Invoice customization settings pre-filled
 *   • Notification config stubs
 *
 * All passwords: Admin@1234
 */

import {
  PrismaClient,
  Role,
  RequisitionStatus,
  PurchaseOrderStatus,
  WastageReason,
  AlertType,
  InventoryTxType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { resyncSequences } from './resync-sequences';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt;
};
const daysAgo = (d: number) => daysFromNow(-d);

async function main() {
  console.log('\n🌱 Seeding GWK V8 — Full Demo Database...\n');

  const hash = await bcrypt.hash('Admin@1234', 10);

  // ==========================================================================
  // BRANCHES
  // ==========================================================================
  const warehouse = await prisma.branch.upsert({
    where: { id: 1 }, update: { cashFloat: 0 },
    create: {
      id: 1, name: 'Central Warehouse', nameAr: 'المستودع الرئيسي',
      isWarehouse: true, address: 'Industrial Area, Zone 81, Doha', phone: '+974-4000-0001', cashFloat: 0,
    },
  });
  const branchDoha = await prisma.branch.upsert({
    where: { id: 2 }, update: { cashFloat: 5000 },
    create: {
      id: 2, name: 'Branch — Doha (West Bay)', nameAr: 'فرع الدوحة — الخليج الغربي',
      address: 'West Bay, Diplomatic Area, Doha', phone: '+974-4000-0002', cashFloat: 5000,
    },
  });
  const branchWakra = await prisma.branch.upsert({
    where: { id: 3 }, update: { cashFloat: 3000 },
    create: {
      id: 3, name: 'Branch — Al Wakra', nameAr: 'فرع الوكرة',
      address: 'Al Wakra Mall, Al Wakra', phone: '+974-4000-0003', cashFloat: 3000,
    },
  });
  console.log('✅ Branches (3)');

  // ==========================================================================
  // UNITS
  // ==========================================================================
  const kg  = await prisma.unit.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'Kilogram',  nameAr: 'كيلوغرام', abbreviation: 'kg'  } });
  const ltr = await prisma.unit.upsert({ where: { id: 2 }, update: {}, create: { id: 2, name: 'Liter',     nameAr: 'لتر',       abbreviation: 'L'   } });
  const pcs = await prisma.unit.upsert({ where: { id: 3 }, update: {}, create: { id: 3, name: 'Piece',     nameAr: 'قطعة',     abbreviation: 'pcs' } });
  const box = await prisma.unit.upsert({ where: { id: 4 }, update: {}, create: { id: 4, name: 'Box',       nameAr: 'صندوق',     abbreviation: 'box' } });
  console.log('✅ Units (4)');

  // ==========================================================================
  // CATEGORIES
  // ==========================================================================
  const catCoffee    = await prisma.category.upsert({ where: { id: 1 }, update: {}, create: { id: 1, name: 'Coffee & Beverages',   nameAr: 'القهوة والمشروبات',     icon: '☕', sortOrder: 1 } });
  const catPastry    = await prisma.category.upsert({ where: { id: 2 }, update: {}, create: { id: 2, name: 'Pastry Raw Materials', nameAr: 'مواد خام المعجنات', icon: '🥐', sortOrder: 2 } });
  const catDairy     = await prisma.category.upsert({ where: { id: 3 }, update: {}, create: { id: 3, name: 'Dairy & Eggs',         nameAr: 'الألبان والبيض',       icon: '🥛', sortOrder: 3 } });
  const catPackaging = await prisma.category.upsert({ where: { id: 4 }, update: {}, create: { id: 4, name: 'Packaging',            nameAr: 'مواد التغليف',         icon: '📦', sortOrder: 4 } });
  const catCleaning  = await prisma.category.upsert({ where: { id: 5 }, update: {}, create: { id: 5, name: 'Cleaning Supplies',    nameAr: 'مستلزمات التنظيف', icon: '🧹', sortOrder: 5 } });
  const catDryGoods  = await prisma.category.upsert({ where: { id: 6 }, update: {}, create: { id: 6, name: 'Dry Goods',            nameAr: 'السلع الجافة',       icon: '🌾', sortOrder: 6 } });
  const catProduce   = await prisma.category.upsert({ where: { id: 7 }, update: {}, create: { id: 7, name: 'Fresh Produce',        nameAr: 'المنتجات الطازجة',   icon: '🥬', sortOrder: 7 } });
  const catMeat      = await prisma.category.upsert({ where: { id: 8 }, update: {}, create: { id: 8, name: 'Meat & Poultry',       nameAr: 'اللحوم والدواجن',     icon: '🥩', sortOrder: 8 } });
  console.log('✅ Categories (8)');

  // ==========================================================================
  // SUPPLIERS
  // ==========================================================================
  const sup1 = await prisma.supplier.upsert({
    where: { id: 1 }, update: {},
    create: { id: 1, name: 'Qatar Food Supplies Co.', nameAr: 'شركة قطر للمواد الغذائية', contactName: 'Ahmed Al-Kuwari',  email: 'ahmed@qatarfood.qa',  phone: '+974-5551-1111', address: 'Industrial Area, Doha', paymentTerms: 'Net 30', taxNumber: 'QAT-100-2021' },
  });
  const sup2 = await prisma.supplier.upsert({
    where: { id: 2 }, update: {},
    create: { id: 2, name: 'Gulf Dairy Qatar',        nameAr: 'خليج الألبان قطر',           contactName: 'Sara Al-Thani',    email: 'sara@gulfdairy.qa',   phone: '+974-5552-2222', address: 'Al Rayyan, Qatar',      paymentTerms: 'Net 15', taxNumber: 'QAT-200-2019' },
  });
  const sup3 = await prisma.supplier.upsert({
    where: { id: 3 }, update: {},
    create: { id: 3, name: 'PackPro Qatar',           nameAr: 'باك برو قطر',                   contactName: 'Khalid Al-Marri',  email: 'khalid@packpro.qa',   phone: '+974-5553-3333', address: 'Salwa Road, Doha',      paymentTerms: 'Net 30', taxNumber: 'QAT-300-2020' },
  });
  const sup4 = await prisma.supplier.upsert({
    where: { id: 4 }, update: {},
    create: { id: 4, name: 'Al Meera Fresh Farms',   nameAr: 'مزارع الميرة الطازجة',       contactName: 'Yousef Al-Emadi', email: 'yousef@almeera.qa',   phone: '+974-5554-4444', address: 'Al Khor, Qatar',        paymentTerms: 'Net 7',  taxNumber: 'QAT-400-2022' },
  });
  console.log('✅ Suppliers (4)');

  // ==========================================================================
  // PRODUCTS (20 items, with allergens on relevant ones)
  // ==========================================================================
  const p: Record<string, any> = {};

  // Coffee & Beverages
  p.cof1 = await prisma.product.upsert({ where: { sku: 'COF-001' }, update: {}, create: { sku: 'COF-001', name: 'Arabica Coffee Beans',  nameAr: 'حبوب قهوة عربيكا',     categoryId: catCoffee.id,    unitId: kg.id,  minStockLevel: 5,  reorderPoint: 10, supplierId: sup1.id, costPrice: 18.00, taxCategory: 'FOOD', yieldFactor: 95,  shelfLifeDays: 365, allergens: [] } });
  p.cof2 = await prisma.product.upsert({ where: { sku: 'COF-002' }, update: {}, create: { sku: 'COF-002', name: 'Espresso Blend Beans',  nameAr: 'حبوب إسبريسو',         categoryId: catCoffee.id,    unitId: kg.id,  minStockLevel: 5,  reorderPoint: 8,  supplierId: sup1.id, costPrice: 15.00, taxCategory: 'FOOD', yieldFactor: 95,  shelfLifeDays: 365, allergens: [] } });
  p.cof3 = await prisma.product.upsert({ where: { sku: 'COF-003' }, update: {}, create: { sku: 'COF-003', name: 'Vanilla Syrup',         nameAr: 'شراب الفانيليا',       categoryId: catCoffee.id,    unitId: ltr.id, minStockLevel: 2,  reorderPoint: 5,  supplierId: sup1.id, costPrice: 12.50, taxCategory: 'FOOD',               shelfLifeDays: 180, allergens: [] } });
  p.cof4 = await prisma.product.upsert({ where: { sku: 'COF-004' }, update: {}, create: { sku: 'COF-004', name: 'Caramel Syrup',         nameAr: 'شراب الكاراميل',       categoryId: catCoffee.id,    unitId: ltr.id, minStockLevel: 2,  reorderPoint: 4,  supplierId: sup1.id, costPrice: 11.00, taxCategory: 'FOOD',               shelfLifeDays: 180, allergens: [] } });
  p.cof5 = await prisma.product.upsert({ where: { sku: 'COF-005' }, update: { tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS' }, create: { sku: 'COF-005', tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS', name: 'Oat Milk',              nameAr: 'حليب الشوفان',             categoryId: catCoffee.id,    unitId: ltr.id, minStockLevel: 5,  reorderPoint: 10, supplierId: sup2.id, costPrice: 9.00,  taxCategory: 'FOOD',               shelfLifeDays: 14,  allergens: ['GLUTEN'] } });

  // Dairy & Eggs
  p.dai1 = await prisma.product.upsert({ where: { sku: 'DAI-001' }, update: { tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS' }, create: { sku: 'DAI-001', tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS', name: 'Whole Milk',            nameAr: 'حليب كامل الدسم',     categoryId: catDairy.id,     unitId: ltr.id, minStockLevel: 20, reorderPoint: 30, supplierId: sup2.id, costPrice: 5.50,  taxCategory: 'FOOD', yieldFactor: 100, shelfLifeDays: 7,   allergens: ['DAIRY'] } });
  p.dai2 = await prisma.product.upsert({ where: { sku: 'DAI-002' }, update: { tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS' }, create: { sku: 'DAI-002', tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS', name: 'Fresh Cream',           nameAr: 'قشدة طازجة',             categoryId: catDairy.id,     unitId: ltr.id, minStockLevel: 5,  reorderPoint: 10, supplierId: sup2.id, costPrice: 8.00,  taxCategory: 'FOOD',               shelfLifeDays: 5,   allergens: ['DAIRY'] } });
  p.dai3 = await prisma.product.upsert({ where: { sku: 'DAI-003' }, update: { tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS' }, create: { sku: 'DAI-003', tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS', name: 'Fresh Eggs',            nameAr: 'بيض طازج',               categoryId: catDairy.id,     unitId: pcs.id, minStockLevel: 30, reorderPoint: 60, supplierId: sup2.id, costPrice: 0.50,  taxCategory: 'FOOD',               shelfLifeDays: 14,  allergens: ['EGGS'] } });

  // Pastry Raw Materials
  p.pas1 = await prisma.product.upsert({ where: { sku: 'PAS-001' }, update: {}, create: { sku: 'PAS-001', name: 'All-Purpose Flour',    nameAr: 'دقيق متعدد الأغراض', categoryId: catPastry.id,    unitId: kg.id,  minStockLevel: 10, reorderPoint: 20, supplierId: sup1.id, costPrice: 3.00,  taxCategory: 'FOOD',               shelfLifeDays: 365, allergens: ['GLUTEN'] } });
  p.pas2 = await prisma.product.upsert({ where: { sku: 'PAS-002' }, update: { tracksExpiry: true, expiryTrackingType: 'MANUFACTURE_TO_EXPIRY' }, create: { sku: 'PAS-002', tracksExpiry: true, expiryTrackingType: 'MANUFACTURE_TO_EXPIRY', name: 'Unsalted Butter',      nameAr: 'زبدة غير مملحة',       categoryId: catPastry.id,    unitId: kg.id,  minStockLevel: 5,  reorderPoint: 10, supplierId: sup2.id, costPrice: 12.00, taxCategory: 'FOOD',               shelfLifeDays: 30,  allergens: ['DAIRY'] } });
  p.pas3 = await prisma.product.upsert({ where: { sku: 'PAS-003' }, update: {}, create: { sku: 'PAS-003', name: 'Granulated Sugar',     nameAr: 'سكر ناعم',               categoryId: catPastry.id,    unitId: kg.id,  minStockLevel: 10, reorderPoint: 15, supplierId: sup1.id, costPrice: 2.50,  taxCategory: 'FOOD',               shelfLifeDays: 730, allergens: [] } });
  p.pas4 = await prisma.product.upsert({ where: { sku: 'PAS-004' }, update: {}, create: { sku: 'PAS-004', name: 'Cocoa Powder',         nameAr: 'مسحوق الكاكاو',         categoryId: catPastry.id,    unitId: kg.id,  minStockLevel: 2,  reorderPoint: 5,  supplierId: sup1.id, costPrice: 22.00, taxCategory: 'FOOD',               shelfLifeDays: 365, allergens: [] } });
  p.pas5 = await prisma.product.upsert({ where: { sku: 'PAS-005' }, update: {}, create: { sku: 'PAS-005', name: 'Almond Flour',         nameAr: 'دقيق اللوز',               categoryId: catPastry.id,    unitId: kg.id,  minStockLevel: 2,  reorderPoint: 4,  supplierId: sup1.id, costPrice: 35.00, taxCategory: 'FOOD',               shelfLifeDays: 180, allergens: ['NUTS'] } });

  // Packaging
  p.pkg1 = await prisma.product.upsert({ where: { sku: 'PKG-001' }, update: {}, create: { sku: 'PKG-001', name: 'Coffee Cups 8oz',      nameAr: 'أكواب قهوة 8 أونص',   categoryId: catPackaging.id, unitId: box.id, minStockLevel: 5,  reorderPoint: 10, supplierId: sup3.id, costPrice: 25.00, taxCategory: 'SUPPLIES',           allergens: [] } });
  p.pkg2 = await prisma.product.upsert({ where: { sku: 'PKG-002' }, update: {}, create: { sku: 'PKG-002', name: 'Coffee Cups 12oz',     nameAr: 'أكواب قهوة 12 أونص',  categoryId: catPackaging.id, unitId: box.id, minStockLevel: 5,  reorderPoint: 10, supplierId: sup3.id, costPrice: 30.00, taxCategory: 'SUPPLIES',           allergens: [] } });
  p.pkg3 = await prisma.product.upsert({ where: { sku: 'PKG-003' }, update: {}, create: { sku: 'PKG-003', name: 'Paper Bags (Medium)',  nameAr: 'أكياس ورقية وسط',     categoryId: catPackaging.id, unitId: box.id, minStockLevel: 3,  reorderPoint: 5,  supplierId: sup3.id, costPrice: 15.00, taxCategory: 'SUPPLIES',           allergens: [] } });

  // Cleaning
  p.cln1 = await prisma.product.upsert({ where: { sku: 'CLN-001' }, update: {}, create: { sku: 'CLN-001', name: 'Surface Cleaner',      nameAr: 'منظف الأسطح',           categoryId: catCleaning.id,  unitId: ltr.id, minStockLevel: 2,  reorderPoint: 4,  supplierId: sup1.id, costPrice: 8.00,  taxCategory: 'SUPPLIES',           allergens: [] } });
  p.cln2 = await prisma.product.upsert({ where: { sku: 'CLN-002' }, update: {}, create: { sku: 'CLN-002', name: 'Dish Soap',            nameAr: 'سائل غسيل الصحون',   categoryId: catCleaning.id,  unitId: ltr.id, minStockLevel: 2,  reorderPoint: 4,  supplierId: sup1.id, costPrice: 6.00,  taxCategory: 'SUPPLIES',           allergens: [] } });

  // Fresh Produce
  p.pro1 = await prisma.product.upsert({ where: { sku: 'PRO-001' }, update: { tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS' }, create: { sku: 'PRO-001', tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS', name: 'Fresh Lemons',         nameAr: 'ليمون طازج',               categoryId: catProduce.id,   unitId: kg.id,  minStockLevel: 2,  reorderPoint: 5,  supplierId: sup4.id, costPrice: 4.00,  taxCategory: 'FOOD',               shelfLifeDays: 14,  allergens: [] } });
  p.pro2 = await prisma.product.upsert({ where: { sku: 'PRO-002' }, update: { tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS' }, create: { sku: 'PRO-002', tracksExpiry: true, expiryTrackingType: 'SHELF_LIFE_DAYS', name: 'Fresh Mint',           nameAr: 'نعناع طازج',               categoryId: catProduce.id,   unitId: kg.id,  minStockLevel: 0.5,reorderPoint: 1,  supplierId: sup4.id, costPrice: 15.00, taxCategory: 'FOOD',               shelfLifeDays: 5,   allergens: [] } });

  console.log(`✅ Products (${Object.keys(p).length})`);

  // ==========================================================================
  // USERS
  // ==========================================================================
  const u: Record<string, any> = {};
  u.admin = await prisma.user.upsert({ where: { email: 'admin@gwk.com' },      update: {}, create: { email: 'admin@gwk.com',      password: hash, firstName: 'Super',   lastName: 'Admin',        firstNameAr: 'سوبر',   lastNameAr: 'أدمين',         role: Role.SUPER_ADMIN,    branchId: warehouse.id,   language: 'en' } });
  u.mgrD = await prisma.user.upsert({ where: { email: 'manager.d@gwk.com' },   update: {}, create: { email: 'manager.d@gwk.com',   password: hash, firstName: 'Rania',   lastName: 'Al-Kuwari',    firstNameAr: 'رانيا',   lastNameAr: 'الكواري',      role: Role.BRANCH_MANAGER, branchId: branchDoha.id,  language: 'ar' } });
  u.mgrW = await prisma.user.upsert({ where: { email: 'manager.w@gwk.com' },   update: {}, create: { email: 'manager.w@gwk.com',   password: hash, firstName: 'Faisal',  lastName: 'Al-Thani',     firstNameAr: 'فيصل',   lastNameAr: 'الثاني',        role: Role.BRANCH_MANAGER, branchId: branchWakra.id, language: 'ar' } });
  u.proc = await prisma.user.upsert({ where: { email: 'procurement@gwk.com' }, update: {}, create: { email: 'procurement@gwk.com', password: hash, firstName: 'Omar',    lastName: 'Al-Marri',     firstNameAr: 'عمر',    lastNameAr: 'المري',         role: Role.PROCUREMENT,    branchId: warehouse.id,   language: 'en' } });
  u.wh   = await prisma.user.upsert({ where: { email: 'warehouse@gwk.com' },   update: {}, create: { email: 'warehouse@gwk.com',   password: hash, firstName: 'Nasser',  lastName: 'Al-Dosari',    firstNameAr: 'ناصر',   lastNameAr: 'الدوسري',      role: Role.WAREHOUSE,      branchId: warehouse.id,   language: 'ar' } });
  u.kit  = await prisma.user.upsert({ where: { email: 'kitchen@gwk.com' },     update: {}, create: { email: 'kitchen@gwk.com',     password: hash, firstName: 'Layla',   lastName: 'Al-Naimi',     firstNameAr: 'ليلى',    lastNameAr: 'النعيمي',       role: Role.KITCHEN,        branchId: branchDoha.id,  language: 'ar' } });
  u.bar  = await prisma.user.upsert({ where: { email: 'barista@gwk.com' },     update: {}, create: { email: 'barista@gwk.com',     password: hash, firstName: 'Tariq',   lastName: 'Al-Hajri',     firstNameAr: 'طارق',    lastNameAr: 'الحاجري',       role: Role.BARISTA,        branchId: branchDoha.id,  language: 'en' } });
  u.pas  = await prisma.user.upsert({ where: { email: 'pastry@gwk.com' },      update: {}, create: { email: 'pastry@gwk.com',      password: hash, firstName: 'Hana',    lastName: 'Al-Sulaiti',   firstNameAr: 'هناء',    lastNameAr: 'السليطي',       role: Role.PASTRY,         branchId: branchDoha.id,  language: 'ar' } });
  u.cash = await prisma.user.upsert({ where: { email: 'cashier@gwk.com' },     update: {}, create: { email: 'cashier@gwk.com',     password: hash, firstName: 'Sami',    lastName: 'Al-Emadi',     firstNameAr: 'سامي',    lastNameAr: 'العمادي',       role: Role.CASHIER,        branchId: branchDoha.id,  language: 'en' } });
  u.clean = await prisma.user.upsert({ where: { email: 'cleaner@gwk.com' },    update: {}, create: { email: 'cleaner@gwk.com',     password: hash, firstName: 'Yusuf',   lastName: 'Al-Kaabi',     firstNameAr: 'يوسف',    lastNameAr: 'الكعبي',        role: Role.CLEANER,        branchId: branchDoha.id,  language: 'ar' } });
  u.kitW = await prisma.user.upsert({ where: { email: 'kitchen.w@gwk.com' },   update: {}, create: { email: 'kitchen.w@gwk.com',   password: hash, firstName: 'Mona',    lastName: 'Al-Mohannadi', firstNameAr: 'منى',     lastNameAr: 'المحنادي',     role: Role.KITCHEN,        branchId: branchWakra.id, language: 'ar' } });
  console.log(`✅ Users (${Object.keys(u).length})`);

  // ---- UserBranch assignments ----
  const ubAssignments = [
    { userId: u.admin.id, branchId: warehouse.id,   isPrimary: true  },
    { userId: u.admin.id, branchId: branchDoha.id,  isPrimary: false },
    { userId: u.admin.id, branchId: branchWakra.id, isPrimary: false },
    { userId: u.mgrD.id,  branchId: branchDoha.id,  isPrimary: true  },
    { userId: u.mgrD.id,  branchId: warehouse.id,   isPrimary: false },
    { userId: u.mgrW.id,  branchId: branchWakra.id, isPrimary: true  },
    { userId: u.mgrW.id,  branchId: warehouse.id,   isPrimary: false },
    { userId: u.proc.id,  branchId: warehouse.id,   isPrimary: true  },
    { userId: u.wh.id,    branchId: warehouse.id,   isPrimary: true  },
    { userId: u.kit.id,   branchId: branchDoha.id,  isPrimary: true  },
    { userId: u.bar.id,   branchId: branchDoha.id,  isPrimary: true  },
    { userId: u.pas.id,   branchId: branchDoha.id,  isPrimary: true  },
    { userId: u.cash.id,  branchId: branchDoha.id,  isPrimary: true  },
    { userId: u.clean.id, branchId: branchDoha.id,  isPrimary: true  },
    { userId: u.kitW.id,  branchId: branchWakra.id, isPrimary: true  },
  ];
  for (const ub of ubAssignments) {
    await prisma.userBranch.upsert({
      where: { userId_branchId: { userId: ub.userId, branchId: ub.branchId } },
      update: {}, create: ub,
    });
  }
  console.log('✅ UserBranch assignments');

  // ==========================================================================
  // INVENTORY (realistic stock levels — some low to trigger alerts)
  // ==========================================================================
  const invData = [
    // Doha branch
    { productId: p.cof1.id, branchId: branchDoha.id,  quantity: 8,   expiryDate: daysFromNow(180) },
    { productId: p.cof2.id, branchId: branchDoha.id,  quantity: 6,   expiryDate: daysFromNow(180) },
    { productId: p.cof3.id, branchId: branchDoha.id,  quantity: 1.5, expiryDate: daysFromNow(60)  }, // LOW
    { productId: p.cof4.id, branchId: branchDoha.id,  quantity: 3,   expiryDate: daysFromNow(60)  },
    { productId: p.cof5.id, branchId: branchDoha.id,  quantity: 4,   expiryDate: daysFromNow(5)   }, // NEAR EXPIRY
    { productId: p.dai1.id, branchId: branchDoha.id,  quantity: 25,  expiryDate: daysFromNow(4)   }, // NEAR EXPIRY
    { productId: p.dai2.id, branchId: branchDoha.id,  quantity: 4,   expiryDate: daysFromNow(3)   }, // NEAR EXPIRY
    { productId: p.dai3.id, branchId: branchDoha.id,  quantity: 48,  expiryDate: daysFromNow(10)  },
    { productId: p.pas1.id, branchId: branchDoha.id,  quantity: 15,  expiryDate: daysFromNow(300) },
    { productId: p.pas2.id, branchId: branchDoha.id,  quantity: 3,   expiryDate: daysFromNow(20)  },
    { productId: p.pas3.id, branchId: branchDoha.id,  quantity: 12,  expiryDate: daysFromNow(600) },
    { productId: p.pas4.id, branchId: branchDoha.id,  quantity: 1.5, expiryDate: daysFromNow(200) }, // LOW
    { productId: p.pas5.id, branchId: branchDoha.id,  quantity: 1,   expiryDate: daysFromNow(90)  }, // LOW
    { productId: p.pkg1.id, branchId: branchDoha.id,  quantity: 8 },
    { productId: p.pkg2.id, branchId: branchDoha.id,  quantity: 4 },
    { productId: p.pkg3.id, branchId: branchDoha.id,  quantity: 2 },  // LOW
    { productId: p.cln1.id, branchId: branchDoha.id,  quantity: 1,   expiryDate: daysFromNow(365) }, // LOW
    { productId: p.cln2.id, branchId: branchDoha.id,  quantity: 3,   expiryDate: daysFromNow(365) },
    { productId: p.pro1.id, branchId: branchDoha.id,  quantity: 3,   expiryDate: daysFromNow(7)   },
    { productId: p.pro2.id, branchId: branchDoha.id,  quantity: 0.3, expiryDate: daysFromNow(3)   }, // LOW + NEAR EXPIRY
    // Al Wakra branch
    { productId: p.cof1.id, branchId: branchWakra.id, quantity: 4,   expiryDate: daysFromNow(150) },
    { productId: p.cof2.id, branchId: branchWakra.id, quantity: 3,   expiryDate: daysFromNow(150) },
    { productId: p.dai1.id, branchId: branchWakra.id, quantity: 18,  expiryDate: daysFromNow(5)   },
    { productId: p.dai3.id, branchId: branchWakra.id, quantity: 36,  expiryDate: daysFromNow(10)  },
    { productId: p.pas1.id, branchId: branchWakra.id, quantity: 8,   expiryDate: daysFromNow(300) },
    { productId: p.pkg1.id, branchId: branchWakra.id, quantity: 5 },
    // Central Warehouse
    { productId: p.cof1.id, branchId: warehouse.id,   quantity: 50,  expiryDate: daysFromNow(270) },
    { productId: p.cof2.id, branchId: warehouse.id,   quantity: 40,  expiryDate: daysFromNow(270) },
    { productId: p.dai1.id, branchId: warehouse.id,   quantity: 100, expiryDate: daysFromNow(30)  },
    { productId: p.pas1.id, branchId: warehouse.id,   quantity: 80,  expiryDate: daysFromNow(300) },
    { productId: p.pas3.id, branchId: warehouse.id,   quantity: 60,  expiryDate: daysFromNow(600) },
    { productId: p.pkg1.id, branchId: warehouse.id,   quantity: 30 },
    { productId: p.pkg2.id, branchId: warehouse.id,   quantity: 25 },
    // ── Multi-batch FEFO demo ──────────────────────────────────────────────
    // Same product + branch held as several batches with different expiries.
    // The grouped inventory view shows these as ONE row with a batch count;
    // click it to see each batch, and stock-out / transfers consume the
    // earliest-expiry batch first (FEFO).
    { productId: p.dai1.id, branchId: warehouse.id,  quantity: 40, expiryDate: daysFromNow(3),  manufactureDate: daysAgo(4) }, // older milk batch (goes first)
    { productId: p.cof5.id, branchId: branchDoha.id, quantity: 6,  expiryDate: daysFromNow(2)  }, // near-expiry oat milk batch
    { productId: p.cof5.id, branchId: branchDoha.id, quantity: 10, expiryDate: daysFromNow(13) }, // fresher oat milk batch
  ];
  // Products configured for expiry tracking get a real FEFO Batch per stock
  // row; everything else stays as a single aggregate (null-batch) row. This
  // also matches the post-migration unique key (productId, branchId, batchId).
  const trackedProductIds = new Set<number>([
    p.cof5.id, p.dai1.id, p.dai2.id, p.dai3.id, p.pas2.id, p.pro1.id, p.pro2.id,
  ]);
  let seedBatchSeq = 0;
  for (const inv of invData as any[]) {
    let batchId: number | null = null;
    let batchNumber: string | null = null;
    if (trackedProductIds.has(inv.productId) && inv.expiryDate) {
      seedBatchSeq += 1;
      batchNumber = `B-SEED-${String(seedBatchSeq).padStart(4, '0')}`;
      const batch = await prisma.batch.upsert({
        where: { batchNumber },
        update: {},
        create: {
          productId: inv.productId,
          batchNumber,
          manufactureDate: inv.manufactureDate ?? null,
          expiryDate: inv.expiryDate,
          unitCost: 0,
          receivedAtBranchId: inv.branchId,
        },
      });
      batchId = batch.id;
    }
    // Idempotent without relying on a nullable compound-unique: match the exact
    // (product, branch, batch) stock row by hand, then update or create it.
    const existing = await prisma.inventory.findFirst({
      where: { productId: inv.productId, branchId: inv.branchId, batchId },
    });
    if (existing) {
      await prisma.inventory.update({
        where: { id: existing.id },
        data: {
          quantity: inv.quantity,
          expiryDate: inv.expiryDate ?? null,
          manufactureDate: inv.manufactureDate ?? null,
          batchNumber,
        },
      });
    } else {
      await prisma.inventory.create({
        data: {
          productId: inv.productId,
          branchId: inv.branchId,
          batchId,
          quantity: inv.quantity,
          expiryDate: inv.expiryDate ?? null,
          manufactureDate: inv.manufactureDate ?? null,
          batchNumber,
        },
      });
    }
  }
  console.log(`✅ Inventory (${invData.length} stock rows, ${seedBatchSeq} FEFO batches)`);

  // ==========================================================================
  // REQUISITIONS — 12 covering every workflow status
  // ==========================================================================
  // Helper: create requisition + status history in one go
  async function makeReq(opts: {
    id: number; no: string; branchId: number; dept: string; priority: string;
    status: RequisitionStatus; createdById: number; reviewedById?: number;
    processedById?: number; notes?: string; neededBy?: Date;
    items: { productId: number; unitId: number; requestedQty: number; approvedQty?: number; receivedQty?: number }[];
    history: { status: RequisitionStatus; changedById: number; notes?: string; daysAgoN: number }[];
  }) {
    const req = await prisma.requisition.upsert({
      where: { id: opts.id },
      update: {},
      create: {
        id: opts.id,
        requisitionNo: opts.no,
        branchId: opts.branchId,
        department: opts.dept,
        status: opts.status,
        priority: opts.priority,
        notes: opts.notes,
        neededBy: opts.neededBy,
        createdById: opts.createdById,
        reviewedById: opts.reviewedById,
        reviewedAt: opts.reviewedById ? daysAgo(3) : undefined,
        processedById: opts.processedById,
        processedAt: opts.processedById ? daysAgo(1) : undefined,
        createdAt: daysAgo(opts.history.length + 1),
      },
    });
    // Items
    for (const item of opts.items) {
      await prisma.requisitionItem.upsert({
        where: { id: opts.id * 100 + opts.items.indexOf(item) },
        update: {},
        create: {
          id: opts.id * 100 + opts.items.indexOf(item),
          requisitionId: req.id,
          productId: item.productId,
          unitId: item.unitId,
          requestedQty: item.requestedQty,
          approvedQty: item.approvedQty,
          receivedQty: item.receivedQty,
        },
      });
    }
    // Status history
    let histId = opts.id * 1000;
    for (const h of opts.history) {
      await prisma.requisitionStatusHistory.upsert({
        where: { id: histId },
        update: {},
        create: {
          id: histId++,
          requisitionId: req.id,
          status: h.status,
          changedById: h.changedById,
          notes: h.notes,
          createdAt: daysAgo(h.daysAgoN),
        },
      });
    }
    return req;
  }

  // REQ-001: SUBMITTED — Barista submitted, waiting for manager review
  const req1 = await makeReq({
    id: 1, no: 'REQ-2026-0001', branchId: branchDoha.id, dept: 'Barista Station',
    priority: 'HIGH', status: RequisitionStatus.SUBMITTED,
    createdById: u.bar.id, neededBy: daysFromNow(2),
    notes: 'Running low on coffee supplies — urgent restock needed before weekend rush',
    items: [
      { productId: p.cof1.id, unitId: kg.id,  requestedQty: 10 },
      { productId: p.cof2.id, unitId: kg.id,  requestedQty: 8  },
      { productId: p.cof3.id, unitId: ltr.id, requestedQty: 4  },
      { productId: p.cof4.id, unitId: ltr.id, requestedQty: 3  },
      { productId: p.cof5.id, unitId: ltr.id, requestedQty: 6  },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED, changedById: u.bar.id, notes: 'Submitted by barista', daysAgoN: 1 },
    ],
  });

  // REQ-002: MANAGER_APPROVED — Kitchen req approved, waiting for procurement
  const req2 = await makeReq({
    id: 2, no: 'REQ-2026-0002', branchId: branchDoha.id, dept: 'Kitchen',
    priority: 'NORMAL', status: RequisitionStatus.MANAGER_APPROVED,
    createdById: u.kit.id, reviewedById: u.mgrD.id, neededBy: daysFromNow(3),
    notes: 'Weekly dairy and egg restock',
    items: [
      { productId: p.dai1.id, unitId: ltr.id, requestedQty: 30, approvedQty: 30 },
      { productId: p.dai2.id, unitId: ltr.id, requestedQty: 10, approvedQty: 8  },
      { productId: p.dai3.id, unitId: pcs.id, requestedQty: 60, approvedQty: 60 },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,        changedById: u.kit.id,  notes: 'Weekly dairy order',       daysAgoN: 4 },
      { status: RequisitionStatus.MANAGER_APPROVED, changedById: u.mgrD.id, notes: 'Approved — reduced cream qty', daysAgoN: 3 },
    ],
  });

  // REQ-003: MANAGER_MODIFIED — Pastry req modified by manager
  const req3 = await makeReq({
    id: 3, no: 'REQ-2026-0003', branchId: branchDoha.id, dept: 'Pastry',
    priority: 'NORMAL', status: RequisitionStatus.MANAGER_MODIFIED,
    createdById: u.pas.id, reviewedById: u.mgrD.id, neededBy: daysFromNow(4),
    notes: 'Pastry ingredients for weekend menu',
    items: [
      { productId: p.pas1.id, unitId: kg.id, requestedQty: 20, approvedQty: 15 },
      { productId: p.pas2.id, unitId: kg.id, requestedQty: 8,  approvedQty: 6  },
      { productId: p.pas3.id, unitId: kg.id, requestedQty: 15, approvedQty: 15 },
      { productId: p.pas4.id, unitId: kg.id, requestedQty: 5,  approvedQty: 3  },
      { productId: p.pas5.id, unitId: kg.id, requestedQty: 4,  approvedQty: 2  },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,        changedById: u.pas.id,  notes: 'Weekend pastry prep',          daysAgoN: 5 },
      { status: RequisitionStatus.MANAGER_MODIFIED, changedById: u.mgrD.id, notes: 'Reduced quantities — budget cap', daysAgoN: 4 },
    ],
  });

  // REQ-004: ORDER_PLACED_WITH_SUPPLIER — Procurement placed order
  const req4 = await makeReq({
    id: 4, no: 'REQ-2026-0004', branchId: branchDoha.id, dept: 'Barista Station',
    priority: 'NORMAL', status: RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER,
    createdById: u.bar.id, reviewedById: u.mgrD.id, processedById: u.proc.id,
    neededBy: daysFromNow(5),
    items: [
      { productId: p.pkg1.id, unitId: box.id, requestedQty: 10, approvedQty: 10 },
      { productId: p.pkg2.id, unitId: box.id, requestedQty: 8,  approvedQty: 8  },
      { productId: p.pkg3.id, unitId: box.id, requestedQty: 5,  approvedQty: 5  },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,                   changedById: u.bar.id,  daysAgoN: 7 },
      { status: RequisitionStatus.MANAGER_APPROVED,            changedById: u.mgrD.id, daysAgoN: 6 },
      { status: RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER,  changedById: u.proc.id, notes: 'PO raised with PackPro Qatar', daysAgoN: 5 },
    ],
  });

  // REQ-005: RECEIVED_AT_WAREHOUSE
  const req5 = await makeReq({
    id: 5, no: 'REQ-2026-0005', branchId: branchDoha.id, dept: 'Kitchen',
    priority: 'NORMAL', status: RequisitionStatus.RECEIVED_AT_WAREHOUSE,
    createdById: u.kit.id, reviewedById: u.mgrD.id, processedById: u.proc.id,
    items: [
      { productId: p.cof1.id, unitId: kg.id,  requestedQty: 20, approvedQty: 20 },
      { productId: p.cof2.id, unitId: kg.id,  requestedQty: 15, approvedQty: 15 },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,                  changedById: u.kit.id,  daysAgoN: 10 },
      { status: RequisitionStatus.MANAGER_APPROVED,           changedById: u.mgrD.id, daysAgoN: 9  },
      { status: RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, changedById: u.proc.id, daysAgoN: 8  },
      { status: RequisitionStatus.RECEIVED_AT_WAREHOUSE,      changedById: u.wh.id,   notes: 'Goods received and checked', daysAgoN: 6 },
    ],
  });

  // REQ-006: DISPATCHED_TO_BRANCH — In transit with driver details
  const req6 = await makeReq({
    id: 6, no: 'REQ-2026-0006', branchId: branchDoha.id, dept: 'Pastry',
    priority: 'HIGH', status: RequisitionStatus.DISPATCHED_TO_BRANCH,
    createdById: u.pas.id, reviewedById: u.mgrD.id, processedById: u.wh.id,
    items: [
      { productId: p.pas1.id, unitId: kg.id, requestedQty: 15, approvedQty: 15 },
      { productId: p.pas2.id, unitId: kg.id, requestedQty: 6,  approvedQty: 6  },
      { productId: p.pas3.id, unitId: kg.id, requestedQty: 10, approvedQty: 10 },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,                  changedById: u.pas.id,  daysAgoN: 8 },
      { status: RequisitionStatus.MANAGER_APPROVED,           changedById: u.mgrD.id, daysAgoN: 7 },
      { status: RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, changedById: u.proc.id, daysAgoN: 6 },
      { status: RequisitionStatus.RECEIVED_AT_WAREHOUSE,      changedById: u.wh.id,   daysAgoN: 4 },
      { status: RequisitionStatus.DISPATCHED_TO_BRANCH,       changedById: u.wh.id,   notes: 'Driver dispatched', daysAgoN: 1 },
    ],
  });
  // Dispatch record with driver details
  await prisma.requisitionDispatch.upsert({
    where: { requisitionId: req6.id },
    update: {},
    create: {
      requisitionId: req6.id,
      destinationBranchId: branchDoha.id,
      driverName: 'Mohammed Al-Qahtani',
      driverPhone: '+974-5566-7788',
      recipientName: 'Hana Al-Sulaiti',
      dispatchedAt: daysAgo(1),
      trackingNotes: 'Delivery van QAT-2024-WH01 — ETA 2 hours',
    },
  });

  // REQ-007: CONFIRMED_RECEIPT — Completed
  const req7 = await makeReq({
    id: 7, no: 'REQ-2026-0007', branchId: branchDoha.id, dept: 'Barista Station',
    priority: 'NORMAL', status: RequisitionStatus.CONFIRMED_RECEIPT,
    createdById: u.bar.id, reviewedById: u.mgrD.id, processedById: u.wh.id,
    items: [
      { productId: p.cof1.id, unitId: kg.id,  requestedQty: 10, approvedQty: 10, receivedQty: 10 },
      { productId: p.cof3.id, unitId: ltr.id, requestedQty: 4,  approvedQty: 4,  receivedQty: 4  },
      { productId: p.cof4.id, unitId: ltr.id, requestedQty: 3,  approvedQty: 3,  receivedQty: 3  },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,                  changedById: u.bar.id,  daysAgoN: 14 },
      { status: RequisitionStatus.MANAGER_APPROVED,           changedById: u.mgrD.id, daysAgoN: 13 },
      { status: RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, changedById: u.proc.id, daysAgoN: 12 },
      { status: RequisitionStatus.RECEIVED_AT_WAREHOUSE,      changedById: u.wh.id,   daysAgoN: 10 },
      { status: RequisitionStatus.DISPATCHED_TO_BRANCH,       changedById: u.wh.id,   daysAgoN: 8  },
      { status: RequisitionStatus.CONFIRMED_RECEIPT,          changedById: u.bar.id,  notes: 'All items received in good condition', daysAgoN: 7 },
    ],
  });

  // REQ-008: CONFIRMED_RECEIPT — Another completed (older)
  const req8 = await makeReq({
    id: 8, no: 'REQ-2026-0008', branchId: branchDoha.id, dept: 'Kitchen',
    priority: 'NORMAL', status: RequisitionStatus.CONFIRMED_RECEIPT,
    createdById: u.kit.id, reviewedById: u.mgrD.id, processedById: u.wh.id,
    items: [
      { productId: p.dai1.id, unitId: ltr.id, requestedQty: 40, approvedQty: 40, receivedQty: 40 },
      { productId: p.dai3.id, unitId: pcs.id, requestedQty: 80, approvedQty: 80, receivedQty: 80 },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,                  changedById: u.kit.id,  daysAgoN: 20 },
      { status: RequisitionStatus.MANAGER_APPROVED,           changedById: u.mgrD.id, daysAgoN: 19 },
      { status: RequisitionStatus.ORDER_PLACED_WITH_SUPPLIER, changedById: u.proc.id, daysAgoN: 18 },
      { status: RequisitionStatus.RECEIVED_AT_WAREHOUSE,      changedById: u.wh.id,   daysAgoN: 16 },
      { status: RequisitionStatus.DISPATCHED_TO_BRANCH,       changedById: u.wh.id,   daysAgoN: 15 },
      { status: RequisitionStatus.CONFIRMED_RECEIPT,          changedById: u.kit.id,  daysAgoN: 14 },
    ],
  });

  // REQ-009: MANAGER_CANCELLED
  await makeReq({
    id: 9, no: 'REQ-2026-0009', branchId: branchDoha.id, dept: 'Cashier',
    priority: 'LOW', status: RequisitionStatus.MANAGER_CANCELLED,
    createdById: u.cash.id, reviewedById: u.mgrD.id,
    notes: 'Duplicate request — already covered by REQ-2026-0007',
    items: [
      { productId: p.cof1.id, unitId: kg.id, requestedQty: 5 },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,         changedById: u.cash.id, daysAgoN: 15 },
      { status: RequisitionStatus.MANAGER_CANCELLED, changedById: u.mgrD.id, notes: 'Duplicate — see REQ-0007', daysAgoN: 14 },
    ],
  });

  // REQ-010: Al Wakra branch — SUBMITTED
  await makeReq({
    id: 10, no: 'REQ-2026-0010', branchId: branchWakra.id, dept: 'Kitchen',
    priority: 'NORMAL', status: RequisitionStatus.SUBMITTED,
    createdById: u.kitW.id, neededBy: daysFromNow(3),
    notes: 'Al Wakra weekly coffee restock',
    items: [
      { productId: p.cof1.id, unitId: kg.id,  requestedQty: 8  },
      { productId: p.cof2.id, unitId: kg.id,  requestedQty: 6  },
      { productId: p.dai1.id, unitId: ltr.id, requestedQty: 20 },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED, changedById: u.kitW.id, daysAgoN: 1 },
    ],
  });

  // REQ-011: Al Wakra — MANAGER_APPROVED
  await makeReq({
    id: 11, no: 'REQ-2026-0011', branchId: branchWakra.id, dept: 'Kitchen',
    priority: 'HIGH', status: RequisitionStatus.MANAGER_APPROVED,
    createdById: u.kitW.id, reviewedById: u.mgrW.id, neededBy: daysFromNow(2),
    items: [
      { productId: p.pas1.id, unitId: kg.id, requestedQty: 10, approvedQty: 10 },
      { productId: p.pas3.id, unitId: kg.id, requestedQty: 8,  approvedQty: 8  },
    ],
    history: [
      { status: RequisitionStatus.SUBMITTED,        changedById: u.kitW.id, daysAgoN: 3 },
      { status: RequisitionStatus.MANAGER_APPROVED, changedById: u.mgrW.id, daysAgoN: 2 },
    ],
  });

  // REQ-012: Doha — DRAFT (not yet submitted)
  await prisma.requisition.upsert({
    where: { id: 12 },
    update: {},
    create: {
      id: 12,
      requisitionNo: 'REQ-2026-0012',
      branchId: branchDoha.id,
      department: 'Barista Station',
      status: RequisitionStatus.DRAFT,
      priority: 'NORMAL',
      notes: 'Draft — preparing cleaning supplies order',
      createdById: u.bar.id,
      createdAt: daysAgo(0),
      items: {
        create: [
          { productId: p.cln1.id, unitId: ltr.id, requestedQty: 4 },
          { productId: p.cln2.id, unitId: ltr.id, requestedQty: 3 },
        ],
      },
    },
  });

  console.log('✅ Requisitions (12 — all statuses covered)');

  // ==========================================================================
  // PURCHASE ORDERS (8 — all statuses)
  // ==========================================================================
  async function makePO(opts: {
    id: number; poNumber: string; supplierId: number; branchId: number;
    status: PurchaseOrderStatus; currency: string; notes?: string;
    expectedDate?: Date; receivedDate?: Date; requisitionId?: number;
    createdById: number; createdAt: Date;
    items: { productId: number; unitId: number; orderedQty: number; unitPrice: number; receivedQty?: number }[];
  }) {
    const total = opts.items.reduce((s, i) => s + i.orderedQty * i.unitPrice, 0);
    return prisma.purchaseOrder.upsert({
      where: { id: opts.id },
      update: {},
      create: {
        id: opts.id,
        poNumber: opts.poNumber,
        supplierId: opts.supplierId,
        branchId: opts.branchId,
        status: opts.status,
        currency: opts.currency,
        totalAmount: total,
        notes: opts.notes,
        expectedDate: opts.expectedDate,
        receivedDate: opts.receivedDate,
        requisitionId: opts.requisitionId,
        createdById: opts.createdById,
        createdAt: opts.createdAt,
        items: {
          create: opts.items.map(i => ({
            productId: i.productId,
            unitId: i.unitId,
            orderedQty: i.orderedQty,
            unitPrice: i.unitPrice,
            receivedQty: i.receivedQty ?? 0,
          })),
        },
      },
    });
  }

  // PO-001: DRAFT — just created
  await makePO({
    id: 1, poNumber: 'PO-2026-0001', supplierId: sup1.id, branchId: branchDoha.id,
    status: PurchaseOrderStatus.DRAFT, currency: 'QAR',
    notes: 'Monthly coffee beans restock',
    expectedDate: daysFromNow(7), createdById: u.proc.id, createdAt: daysAgo(1),
    items: [
      { productId: p.cof1.id, unitId: kg.id, orderedQty: 30, unitPrice: 18.00 },
      { productId: p.cof2.id, unitId: kg.id, orderedQty: 25, unitPrice: 15.00 },
      { productId: p.cof3.id, unitId: ltr.id, orderedQty: 10, unitPrice: 12.50 },
      { productId: p.cof4.id, unitId: ltr.id, orderedQty: 8,  unitPrice: 11.00 },
    ],
  });

  // PO-002: SENT_TO_SUPPLIER — awaiting delivery
  await makePO({
    id: 2, poNumber: 'PO-2026-0002', supplierId: sup2.id, branchId: branchDoha.id,
    status: PurchaseOrderStatus.SENT_TO_SUPPLIER, currency: 'QAR',
    notes: 'Dairy restock — urgent, low stock at Doha branch',
    expectedDate: daysFromNow(2), createdById: u.proc.id, createdAt: daysAgo(3),
    items: [
      { productId: p.dai1.id, unitId: ltr.id, orderedQty: 100, unitPrice: 5.50 },
      { productId: p.dai2.id, unitId: ltr.id, orderedQty: 20,  unitPrice: 8.00 },
      { productId: p.dai3.id, unitId: pcs.id, orderedQty: 120, unitPrice: 0.50 },
      { productId: p.pas2.id, unitId: kg.id,  orderedQty: 15,  unitPrice: 12.00 },
    ],
  });

  // PO-003: SENT_TO_SUPPLIER — packaging order
  await makePO({
    id: 3, poNumber: 'PO-2026-0003', supplierId: sup3.id, branchId: branchDoha.id,
    status: PurchaseOrderStatus.SENT_TO_SUPPLIER, currency: 'QAR',
    requisitionId: req4.id,
    notes: 'Linked to REQ-2026-0004',
    expectedDate: daysFromNow(4), createdById: u.proc.id, createdAt: daysAgo(5),
    items: [
      { productId: p.pkg1.id, unitId: box.id, orderedQty: 20, unitPrice: 25.00 },
      { productId: p.pkg2.id, unitId: box.id, orderedQty: 15, unitPrice: 30.00 },
      { productId: p.pkg3.id, unitId: box.id, orderedQty: 10, unitPrice: 15.00 },
    ],
  });

  // PO-004: PARTIALLY_RECEIVED
  await makePO({
    id: 4, poNumber: 'PO-2026-0004', supplierId: sup1.id, branchId: warehouse.id,
    status: PurchaseOrderStatus.PARTIALLY_RECEIVED, currency: 'QAR',
    notes: 'Dry goods bulk order — partial delivery received',
    expectedDate: daysFromNow(3), createdById: u.proc.id, createdAt: daysAgo(8),
    items: [
      { productId: p.pas1.id, unitId: kg.id, orderedQty: 100, unitPrice: 3.00,  receivedQty: 60 },
      { productId: p.pas3.id, unitId: kg.id, orderedQty: 80,  unitPrice: 2.50,  receivedQty: 80 },
      { productId: p.pas4.id, unitId: kg.id, orderedQty: 20,  unitPrice: 22.00, receivedQty: 0  },
    ],
  });

  // PO-005: FULLY_RECEIVED — completed last week
  await makePO({
    id: 5, poNumber: 'PO-2026-0005', supplierId: sup2.id, branchId: branchDoha.id,
    status: PurchaseOrderStatus.FULLY_RECEIVED, currency: 'QAR',
    notes: 'Dairy weekly order — fully received',
    expectedDate: daysAgo(7), receivedDate: daysAgo(7),
    createdById: u.proc.id, createdAt: daysAgo(14),
    items: [
      { productId: p.dai1.id, unitId: ltr.id, orderedQty: 80,  unitPrice: 5.50, receivedQty: 80  },
      { productId: p.dai2.id, unitId: ltr.id, orderedQty: 15,  unitPrice: 8.00, receivedQty: 15  },
      { productId: p.dai3.id, unitId: pcs.id, orderedQty: 100, unitPrice: 0.50, receivedQty: 100 },
    ],
  });

  // PO-006: FULLY_RECEIVED — coffee order 2 weeks ago
  await makePO({
    id: 6, poNumber: 'PO-2026-0006', supplierId: sup1.id, branchId: branchDoha.id,
    status: PurchaseOrderStatus.FULLY_RECEIVED, currency: 'QAR',
    requisitionId: req7.id,
    notes: 'Linked to REQ-2026-0007',
    expectedDate: daysAgo(10), receivedDate: daysAgo(10),
    createdById: u.proc.id, createdAt: daysAgo(18),
    items: [
      { productId: p.cof1.id, unitId: kg.id,  orderedQty: 20, unitPrice: 18.00, receivedQty: 20 },
      { productId: p.cof3.id, unitId: ltr.id, orderedQty: 8,  unitPrice: 12.50, receivedQty: 8  },
      { productId: p.cof4.id, unitId: ltr.id, orderedQty: 6,  unitPrice: 11.00, receivedQty: 6  },
    ],
  });

  // PO-007: CANCELLED
  await makePO({
    id: 7, poNumber: 'PO-2026-0007', supplierId: sup4.id, branchId: branchDoha.id,
    status: PurchaseOrderStatus.CANCELLED, currency: 'QAR',
    notes: 'Cancelled — supplier could not fulfill order in time',
    expectedDate: daysAgo(5), createdById: u.proc.id, createdAt: daysAgo(12),
    items: [
      { productId: p.pro1.id, unitId: kg.id, orderedQty: 10, unitPrice: 4.00 },
      { productId: p.pro2.id, unitId: kg.id, orderedQty: 2,  unitPrice: 15.00 },
    ],
  });

  // PO-008: DRAFT — Al Wakra branch order
  await makePO({
    id: 8, poNumber: 'PO-2026-0008', supplierId: sup1.id, branchId: branchWakra.id,
    status: PurchaseOrderStatus.DRAFT, currency: 'QAR',
    notes: 'Al Wakra monthly coffee order',
    expectedDate: daysFromNow(10), createdById: u.proc.id, createdAt: daysAgo(0),
    items: [
      { productId: p.cof1.id, unitId: kg.id, orderedQty: 20, unitPrice: 18.00 },
      { productId: p.cof2.id, unitId: kg.id, orderedQty: 15, unitPrice: 15.00 },
      { productId: p.cof5.id, unitId: ltr.id, orderedQty: 12, unitPrice: 9.00 },
    ],
  });

  console.log('✅ Purchase Orders (8 — all statuses covered)');

  // ==========================================================================
  // SUPPLIER PRICE HISTORY
  // ==========================================================================
  const priceHistoryData = [
    { supplierId: sup1.id, productId: p.cof1.id, oldPrice: 16.00, newPrice: 18.00, changedById: u.proc.id, source: 'MANUAL',     notes: 'Price increase due to global coffee shortage',  createdAt: daysAgo(30) },
    { supplierId: sup1.id, productId: p.cof2.id, oldPrice: 14.00, newPrice: 15.00, changedById: u.proc.id, source: 'MANUAL',     notes: 'Annual price revision',                         createdAt: daysAgo(30) },
    { supplierId: sup2.id, productId: p.dai1.id, oldPrice: 5.00,  newPrice: 5.50,  changedById: u.proc.id, source: 'MANUAL',     notes: 'Dairy price increase Q2 2026',                 createdAt: daysAgo(45) },
    { supplierId: sup2.id, productId: p.pas2.id, oldPrice: 11.00, newPrice: 12.00, changedById: u.proc.id, source: 'BULK_UPDATE', notes: 'Bulk pricing adjustment — dairy category +8%',  createdAt: daysAgo(20) },
    { supplierId: sup3.id, productId: p.pkg1.id, oldPrice: 22.00, newPrice: 25.00, changedById: u.proc.id, source: 'MANUAL',     notes: 'Packaging cost increase',                      createdAt: daysAgo(60) },
    { supplierId: sup1.id, productId: p.pas4.id, oldPrice: 20.00, newPrice: 22.00, changedById: u.proc.id, source: 'MANUAL',     notes: 'Cocoa price increase — global supply issue',    createdAt: daysAgo(15) },
  ];
  for (let i = 0; i < priceHistoryData.length; i++) {
    const ph = priceHistoryData[i];
    await prisma.supplierPriceHistory.upsert({
      where: { id: i + 1 },
      update: {},
      create: { id: i + 1, ...ph },
    });
  }
  console.log(`✅ Supplier Price History (${priceHistoryData.length})`);

  // ==========================================================================
  // WASTAGE RECORDS (10 — all 6 reasons)
  // ==========================================================================
  const wastageData = [
    { branchId: branchDoha.id,  productId: p.dai2.id, unitId: ltr.id, quantity: 2,   reason: WastageReason.EXPIRED,           notes: 'Cream expired before use',                loggedById: u.kit.id,  createdAt: daysAgo(2)  },
    { branchId: branchDoha.id,  productId: p.cof3.id, unitId: ltr.id, quantity: 0.5, reason: WastageReason.SPILLAGE,          notes: 'Bottle knocked over during rush hour',     loggedById: u.bar.id,  createdAt: daysAgo(3)  },
    { branchId: branchDoha.id,  productId: p.pas1.id, unitId: kg.id,  quantity: 1.5, reason: WastageReason.OVERPRODUCTION,    notes: 'Excess dough from weekend batch',          loggedById: u.pas.id,  createdAt: daysAgo(4)  },
    { branchId: branchDoha.id,  productId: p.dai3.id, unitId: pcs.id, quantity: 6,   reason: WastageReason.DAMAGED,           notes: 'Eggs cracked during delivery',             loggedById: u.kit.id,  createdAt: daysAgo(5)  },
    { branchId: branchDoha.id,  productId: p.cof1.id, unitId: kg.id,  quantity: 0.3, reason: WastageReason.QUALITY_REJECTION, notes: 'Batch had off smell — rejected by barista', loggedById: u.bar.id,  createdAt: daysAgo(6)  },
    { branchId: branchDoha.id,  productId: p.pro2.id, unitId: kg.id,  quantity: 0.2, reason: WastageReason.EXPIRED,           notes: 'Fresh mint wilted',                        loggedById: u.kit.id,  createdAt: daysAgo(1)  },
    { branchId: branchDoha.id,  productId: p.pas2.id, unitId: kg.id,  quantity: 0.5, reason: WastageReason.OTHER,             notes: 'Butter left out of fridge overnight',      loggedById: u.pas.id,  createdAt: daysAgo(7)  },
    { branchId: branchWakra.id, productId: p.dai1.id, unitId: ltr.id, quantity: 3,   reason: WastageReason.EXPIRED,           notes: 'Milk expired — fridge malfunction',         loggedById: u.kitW.id, createdAt: daysAgo(3)  },
    { branchId: branchWakra.id, productId: p.cof2.id, unitId: kg.id,  quantity: 0.4, reason: WastageReason.SPILLAGE,          notes: 'Grinder overflow',                         loggedById: u.kitW.id, createdAt: daysAgo(8)  },
    { branchId: branchDoha.id,  productId: p.cof5.id, unitId: ltr.id, quantity: 1,   reason: WastageReason.QUALITY_REJECTION, notes: 'Oat milk separated — batch defect',         loggedById: u.bar.id,  createdAt: daysAgo(2)  },
  ];
  for (let i = 0; i < wastageData.length; i++) {
    const w = wastageData[i];
    await prisma.wastageRecord.upsert({
      where: { id: i + 1 },
      update: {},
      create: { id: i + 1, ...w },
    });
  }
  console.log(`✅ Wastage Records (${wastageData.length})`);

  // ==========================================================================
  // ALERTS (low stock + near expiry)
  // ==========================================================================
  const alertsData = [
    { type: AlertType.LOW_STOCK,      title: 'Low Stock: Vanilla Syrup',    titleAr: 'مخزون منخفض: شراب الفانيليا',  message: 'Vanilla Syrup at Doha branch is below minimum (1.5L / min 2L)',    messageAr: 'شراب الفانيليا في فرع الدوحة أقل من الحد الأدنى', branchId: branchDoha.id,  productId: p.cof3.id, isRead: false, isResolved: false },
    { type: AlertType.LOW_STOCK,      title: 'Low Stock: Cocoa Powder',     titleAr: 'مخزون منخفض: مسحوق الكاكاو',  message: 'Cocoa Powder at Doha branch is below minimum (1.5kg / min 2kg)',   messageAr: 'مسحوق الكاكاو في فرع الدوحة أقل من الحد الأدنى', branchId: branchDoha.id,  productId: p.pas4.id, isRead: false, isResolved: false },
    { type: AlertType.LOW_STOCK,      title: 'Low Stock: Almond Flour',     titleAr: 'مخزون منخفض: دقيق اللوز',     message: 'Almond Flour at Doha branch is below minimum (1kg / min 2kg)',     messageAr: 'دقيق اللوز في فرع الدوحة أقل من الحد الأدنى', branchId: branchDoha.id,  productId: p.pas5.id, isRead: false, isResolved: false },
    { type: AlertType.EXPIRY_WARNING, title: 'Expiry Warning: Oat Milk',    titleAr: 'تحذير انتهاء: حليب الشوفان',  message: 'Oat Milk at Doha branch expires in 5 days',                        messageAr: 'حليب الشوفان في فرع الدوحة ينتهي خلال 5 أيام',  branchId: branchDoha.id,  productId: p.cof5.id, isRead: false, isResolved: false },
    { type: AlertType.EXPIRY_WARNING, title: 'Expiry Warning: Fresh Cream',  titleAr: 'تحذير انتهاء: قشدة طازجة',    message: 'Fresh Cream at Doha branch expires in 3 days',                     messageAr: 'القشدة الطازجة في فرع الدوحة تنتهي خلال 3 أيام',  branchId: branchDoha.id,  productId: p.dai2.id, isRead: true,  isResolved: false },
    { type: AlertType.EXPIRY_WARNING, title: 'Expiry Warning: Fresh Mint',   titleAr: 'تحذير انتهاء: نعناع طازج',     message: 'Fresh Mint at Doha branch expires in 3 days — use immediately',    messageAr: 'النعناع الطازج في فرع الدوحة ينتهي خلال 3 أيام',  branchId: branchDoha.id,  productId: p.pro2.id, isRead: false, isResolved: false },
  ];
  for (let i = 0; i < alertsData.length; i++) {
    await prisma.alert.upsert({
      where: { id: i + 1 },
      update: {},
      create: { id: i + 1, ...alertsData[i], createdAt: daysAgo(i === 0 ? 0 : i) },
    });
  }
  console.log(`✅ Alerts (${alertsData.length})`);

  // ==========================================================================
  // SETTINGS (company info + invoice customization pre-filled)
  // ==========================================================================
  const settingsData = [
    // General
    { key: 'company_name',         value: 'GWK Food & Beverage',          group: 'general'      },
    { key: 'company_name_ar',      value: 'شركة جيدبليوكي للأغذية والمشروبات',  group: 'general'      },
    { key: 'company_tax_id',       value: 'QAT-GWK-2021-001',             group: 'general'      },
    { key: 'company_address',      value: 'West Bay, Doha, Qatar',         group: 'general'      },
    { key: 'company_phone',        value: '+974-4000-0001',                group: 'general'      },
    { key: 'app_version',          value: '8.0.0',                         group: 'general'      },
    // Branding
    { key: 'company_logo',         value: '',                              group: 'branding'     },
    { key: 'primary_color',        value: '#1e40af',                       group: 'branding'     },
    // Theme engine defaults (ready presets + manual picker)
    { key: 'theme_mode',           value: 'preset',                        group: 'branding'     },
    { key: 'theme_preset',         value: 'blue',                          group: 'branding'     },
    { key: 'theme_primary',        value: '#2563eb',                       group: 'branding'     },
    { key: 'theme_font',           value: 'inter',                         group: 'branding'     },
    { key: 'secondary_color',      value: '#3b82f6',                       group: 'branding'     },
    // Finance
    { key: 'default_currency',     value: 'QAR',                           group: 'finance'      },
    { key: 'supported_currencies', value: 'QAR,USD,EUR,AED,SAR,GBP',       group: 'finance'      },
    // Inventory
    { key: 'expiry_warning_days',  value: '7',                             group: 'inventory'    },
    { key: 'low_stock_alert',      value: 'true',                          group: 'inventory'    },
    // Localization
    { key: 'default_language',     value: 'en',                            group: 'localization' },
    // Invoice customization (pre-filled so PDF works out of the box)
    { key: 'invoice_header_text',  value: 'GWK Food & Beverage — Official Purchase Order', group: 'invoice' },
    { key: 'invoice_footer_text',  value: 'Thank you for your business — شكراً لتعاملكم معنا', group: 'invoice' },
    { key: 'invoice_terms',        value: 'Payment due within 30 days of invoice date. All prices in QAR unless stated otherwise. Goods remain property of GWK until full payment received.', group: 'invoice' },
    { key: 'invoice_accent_color', value: '#1e40af',                       group: 'invoice'      },
    { key: 'invoice_show_logo',    value: 'true',                          group: 'invoice'      },
    { key: 'invoice_tax_rate',     value: '5',                             group: 'invoice'      },
    { key: 'invoice_currency',     value: 'QAR',                           group: 'invoice'      },
    { key: 'invoice_sig_prepared', value: 'Prepared By / أعده',              group: 'invoice'      },
    { key: 'invoice_sig_approved', value: 'Approved By / وافق عليه',          group: 'invoice'      },
    { key: 'invoice_sig_ack',      value: 'Supplier Acknowledgment / إقرار المورد', group: 'invoice' },
    { key: 'invoice_paper_size',   value: 'A4',                            group: 'invoice'      },
    { key: 'invoice_language',     value: 'en',                            group: 'invoice'      },

    // Notification sounds (real-time alert/order/requisition chimes)
    { key: 'sound_enabled',              value: 'true', group: 'sound' },
    { key: 'sound_volume',               value: '70',   group: 'sound' },
    { key: 'sound_alerts_enabled',       value: 'true', group: 'sound' },
    { key: 'sound_requisitions_enabled', value: 'true', group: 'sound' },
    { key: 'sound_orders_enabled',       value: 'true', group: 'sound' },
    { key: 'sound_url_alerts',           value: '',     group: 'sound' },
    { key: 'sound_url_requisitions',     value: '',     group: 'sound' },
    { key: 'sound_url_orders',           value: '',     group: 'sound' },
  ];
  for (const s of settingsData) {
    await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
  }
  console.log(`✅ Settings (${settingsData.length})`);

  // ==========================================================================
  // NOTIFICATION CONFIG STUBS
  // ==========================================================================
  const notifConfigs = [
    { key: 'whatsapp_enabled',      value: 'false', group: 'notifications' },
    { key: 'whatsapp_phone_number', value: '',       group: 'notifications' },
    { key: 'whatsapp_token',        value: '',       group: 'notifications' },
    { key: 'smtp_enabled',          value: 'false',  group: 'notifications' },
    { key: 'smtp_host',             value: '',       group: 'notifications' },
    { key: 'smtp_port',             value: '587',    group: 'notifications' },
    { key: 'smtp_user',             value: '',       group: 'notifications' },
    { key: 'smtp_pass',             value: '',       group: 'notifications' },
    { key: 'smtp_from',             value: '',       group: 'notifications' },
  ];
  for (const nc of notifConfigs) {
    await prisma.notificationConfig.upsert({ where: { key: nc.key }, update: {}, create: nc });
  }
  console.log(`✅ Notification Config (${notifConfigs.length})`);

  // ==========================================================================
  // SEQUENCE RESYNC — critical: rows above were inserted with explicit ids,
  // which does NOT advance Postgres id sequences. Realign them so the first
  // runtime create() (e.g. the alerts scheduler) doesn't collide on id.
  // ==========================================================================
  const seqResults = await resyncSequences(prisma);
  console.log(`✅ Sequences resynced (${seqResults.filter(r => !r.skipped).length} tables)`);

  // Drivers — available in the dispatch picker (idempotent: only seed if empty).
  if ((await prisma.driver.count()) === 0) {
    await prisma.driver.createMany({
      data: [
        { name: 'Mohammed Al-Qahtani', phone: '+974-5566-7788', vehicle: 'Van — 12345' },
        { name: 'Ahmed Al-Kuwari',     phone: '+974-5551-1234', vehicle: 'Truck — 67890' },
        { name: 'Yousef Hassan',       phone: '+974-5599-4321', vehicle: 'Van — 54321' },
      ],
    });
    console.log('🚚 Seeded 3 drivers');
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log(`
✨ GWK V8 Full Demo Seed Complete!

📊 Data Summary:
   • 3 Branches (1 warehouse + 2 restaurant)
   • 4 Units, 8 Categories, 4 Suppliers
   • ${Object.keys(p).length} Products (with allergen tracking)
   • ${Object.keys(u).length} Users (all 8 roles)
   • ${invData.length} Inventory records across all branches
   • Batch/FEFO tracking on perishables (milk, cream, eggs, oat milk, butter, produce)
   • 12 Requisitions (every workflow status)
   • 8 Purchase Orders (all statuses: DRAFT → FULLY_RECEIVED)
   • ${priceHistoryData.length} Supplier price history entries
   • ${wastageData.length} Wastage records (all 6 reasons)
   • ${alertsData.length} Alerts (low stock + expiry warnings)
   • ${settingsData.length} Settings (incl. invoice customization)

🔑 All passwords: Admin@1234

📝 Demo Credentials:
   admin@gwk.com        → Super Admin (all branches)
   manager.d@gwk.com    → Branch Manager (Doha)
   manager.w@gwk.com    → Branch Manager (Al Wakra)
   procurement@gwk.com  → Procurement (Warehouse)
   warehouse@gwk.com    → Warehouse (Warehouse)
   kitchen@gwk.com      → Kitchen (Doha)
   barista@gwk.com      → Barista (Doha)
   pastry@gwk.com       → Pastry (Doha)
   cashier@gwk.com      → Cashier (Doha)
   kitchen.w@gwk.com    → Kitchen (Al Wakra)

🔄 Suggested Demo Workflow:
   1. Login as kitchen@gwk.com → browse catalog (see allergen badges) → submit requisition
   2. Login as manager.d@gwk.com → approve REQ-2026-0001
   3. Login as procurement@gwk.com → advance to ORDER_PLACED → create PO
   4. Login as warehouse@gwk.com → mark RECEIVED_AT_WAREHOUSE → dispatch with driver details
   5. Login as kitchen@gwk.com → see driver info → confirm receipt
   6. Login as admin@gwk.com → Admin Panel → customize invoice → download PDF from PO page
   7. Login as admin@gwk.com → check Alerts (3 low stock + 3 expiry warnings active)
   8. Inventory → "All Inventory": Whole Milk (Warehouse) & Oat Milk (Doha) show a
      batch count — click a row to see each batch and its expiry (earliest first).
   9. Inventory → Adjust Stock → "Stock Out" a tracked item: oldest-expiry batch is
      consumed first automatically (FEFO) — no manual batch picking.
   10. Branch Transfers → New Transfer (Warehouse → Doha) → tab out of Qty to preview
       the FEFO batches that will move, then Dispatch and Approve & Receive.
  `);
}

main().catch(console.error).finally(() => prisma.$disconnect());
