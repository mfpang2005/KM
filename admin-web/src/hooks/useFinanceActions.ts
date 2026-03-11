import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Order, FinanceData } from '../types';

export const useFinanceActions = (
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>,
    setData: React.Dispatch<React.SetStateAction<FinanceData | null>>
) => {
    const handleUpdateField = useCallback(async (orderId: string, field: string, value: any) => {
        setOrders(prevOrders => {
            const orderIndex = prevOrders.findIndex(o => o.id === orderId);
            if (orderIndex === -1) return prevOrders;

            const order = prevOrders[orderIndex];
            const originalOrder = { ...order };
            const total = order.amount || 0;

            let updatePayload: any = { [field]: value };
            let newOrder = { ...order, [field]: value };
            let deltaRevenue = 0;
            let deltaUnpaid = 0;

            // 1. Math Logic for Payment Received
            if (field === 'payment_received') {
                const payment = parseFloat(value) || 0;
                const prevPayment = order.payment_received || 0;
                deltaRevenue = payment - prevPayment;
                const newBalance = Math.max(0, total - payment);
                deltaUnpaid = (newBalance - (order.balance || 0));
                const newStatus = newBalance <= 0 ? 'paid' : 'unpaid';

                updatePayload = {
                    ...updatePayload,
                    payment_received: payment,
                    balance: newBalance,
                    paymentStatus: newStatus,
                    amount: total
                };

                newOrder = {
                    ...newOrder,
                    payment_received: payment,
                    balance: newBalance,
                    paymentStatus: newStatus
                };
            } 
            // 2. Manual Status Override
            else if (field === 'paymentStatus') {
                const newStatus = value.toLowerCase();
                if (newStatus === 'paid') {
                    const prevPayment = order.payment_received || 0;
                    deltaRevenue = total - prevPayment;
                    deltaUnpaid = -(order.balance || 0);

                    updatePayload = {
                        ...updatePayload,
                        paymentStatus: 'paid',
                        payment_received: total,
                        balance: 0,
                        amount: total
                    };

                    newOrder = {
                        ...newOrder,
                        paymentStatus: 'paid',
                        payment_received: total,
                        balance: 0
                    };
                } else {
                    updatePayload = { ...updatePayload, paymentStatus: 'unpaid' };
                    newOrder = { ...newOrder, paymentStatus: 'unpaid' };
                }
            }

            // Apply optimistic update to orders
            const nextOrders = [...prevOrders];
            nextOrders[orderIndex] = newOrder;

            // Apply optimistic update to stats
            if (deltaRevenue !== 0 || deltaUnpaid !== 0) {
                setData(prevData => {
                    if (!prevData) return prevData;
                    return {
                        ...prevData,
                        periodRevenue: prevData.periodRevenue + deltaRevenue,
                        totalUnpaidBalance: prevData.totalUnpaidBalance + deltaUnpaid
                    };
                });
            }

            // Async Database Update
            supabase.from('orders').update(updatePayload).eq('id', orderId).then(({ error }) => {
                if (error) {
                    console.error(`Failed to update ${field}`, error);
                    // Rollback on error (simplified for demo, in production we might need a better rollback)
                    setOrders(current => current.map(o => o.id === orderId ? originalOrder : o));
                    if (deltaRevenue !== 0 || deltaUnpaid !== 0) {
                        setData(currentData => {
                            if (!currentData) return currentData;
                            return {
                                ...currentData,
                                periodRevenue: currentData.periodRevenue - deltaRevenue,
                                totalUnpaidBalance: currentData.totalUnpaidBalance - deltaUnpaid
                            };
                        });
                    }
                }
            });

            return nextOrders;
        });
    }, [setOrders, setData]);

    return { handleUpdateField };
};
