import Stripe from 'stripe';
export function billingConfigured(){return !!(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PRICE_ID&&process.env.STRIPE_WEBHOOK_SECRET&&Number(process.env.PAID_MONTHLY_LIMIT)>0);}
export function stripeClient(){if(!process.env.STRIPE_SECRET_KEY)throw new Error('Billing is not configured');return new Stripe(process.env.STRIPE_SECRET_KEY);}
