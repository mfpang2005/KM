-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create orders table
create table orders (
  id text primary key, -- Keeping as text to match frontend 'KL-xxxx' format, or use uuid
  "customerName" text not null,
  "customerPhone" text,
  address text,
  items jsonb, -- Storing items as JSONB for simplicity as discussed
  status text check (status in ('pending', 'preparing', 'ready', 'delivering', 'completed')),
  amount numeric,
  "dueTime" text,
  type text,
  "driverId" text,
  "paymentMethod" text,
  "paymentStatus" text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create products table
create table products (
  id text primary key,
  code text unique,
  name text,
  price numeric,
  category text,
  image_url text
);

-- Row Level Security (RLS) - Optional for initial dev but good practice
alter table orders enable row level security;
alter table products enable row level security;

-- Create policies (allowing public access for now for simplicity of testing)
create policy "Public orders access" on orders for all using (true);
create policy "Public products access" on products for all using (true);

-- Create users table
create table users (
  id uuid default uuid_generate_v4() primary key,
  email text unique not null,
  role text check (role in ('admin', 'kitchen', 'driver')),
  name text,
  phone text,
  avatar_url text
);

create policy "Public users access" on users for all using (true);
