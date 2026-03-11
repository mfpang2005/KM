-- 在 Supabase Dashboard > SQL Editor 中运行此脚本
-- 为 orders 表补全缺失的列
DO $$ BEGIN -- equipments: 设备/物资 JSONB
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'equipments'
) THEN
ALTER TABLE public.orders
ADD COLUMN equipments jsonb DEFAULT '{}';
RAISE NOTICE 'Added column: equipments';
ELSE RAISE NOTICE 'Column equipments already exists';
END IF;
-- driverId: 指派司机
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'driverId'
) THEN
ALTER TABLE public.orders
ADD COLUMN "driverId" text;
RAISE NOTICE 'Added column: driverId';
ELSE RAISE NOTICE 'Column driverId already exists';
END IF;
-- paymentStatus: 付款状态
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'paymentStatus'
) THEN
ALTER TABLE public.orders
ADD COLUMN "paymentStatus" text DEFAULT 'pending';
RAISE NOTICE 'Added column: paymentStatus';
ELSE RAISE NOTICE 'Column paymentStatus already exists';
END IF;
-- delivery_photos: 送餐照片列表
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'delivery_photos'
) THEN
ALTER TABLE public.orders
ADD COLUMN delivery_photos jsonb DEFAULT '[]';
RAISE NOTICE 'Added column: delivery_photos';
ELSE RAISE NOTICE 'Column delivery_photos already exists';
END IF;
-- batch: 批号 (选填)
IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'batch'
) THEN
ALTER TABLE public.orders
ADD COLUMN batch text;
RAISE NOTICE 'Added column: batch';
ELSE RAISE NOTICE 'Column batch already exists';
END IF;
END $$;