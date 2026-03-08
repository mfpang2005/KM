import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Notification {
    id: string;
    customerName: string;
    amount: number;
    created_at: string;
}

export const useNotifications = () => {
    const [showNotifs, setShowNotifs] = useState(false);
    const [notifs, setNotifs] = useState<Notification[]>([]);
    const [unread, setUnread] = useState(0);

    const loadNotifs = async () => {
        try {
            const lastSeen = parseInt(localStorage.getItem('last_seen_notifs') || '0');
            const { data } = await supabase
                .from('orders')
                .select('id, customerName, amount, created_at')
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(10);

            if (data) {
                const unseen = data.filter(n => new Date(n.created_at).getTime() > lastSeen);
                setNotifs(unseen);
                setUnread(unseen.length);
            }
        } catch (e) {
            console.error('Failed to load notifications', e);
        }
    };

    useEffect(() => {
        loadNotifs();

        const ch = supabase
            .channel('notif-bell-global')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadNotifs())
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, []);

    const toggleNotifs = () => {
        const willShow = !showNotifs;
        setShowNotifs(willShow);
        if (willShow) {
            setUnread(0);
        } else {
            localStorage.setItem('last_seen_notifs', Date.now().toString());
            setNotifs([]);
            setUnread(0);
        }
    };

    const clearAll = () => {
        localStorage.setItem('last_seen_notifs', Date.now().toString());
        setNotifs([]);
        setUnread(0);
        setShowNotifs(false);
    };

    return {
        showNotifs,
        setShowNotifs,
        notifs,
        unread,
        toggleNotifs,
        clearAll
    };
};
