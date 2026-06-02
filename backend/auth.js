const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretpokerkey';

// Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window per IP
    message: { error: 'Too many requests, please try again later.' }
});

// Password Validation
const isValidPassword = (password) => {
    // Min 8 chars, 1 uppercase, 1 number
    const regex = /^(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(password);
};

// Register Endpoint
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        if (!isValidPassword(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long, contain 1 uppercase letter and 1 number.' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if user exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    { email: normalizedEmail }
                ]
            }
        });

        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'Username already taken' });
            }
            return res.status(400).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { username, email: normalizedEmail, passwordHash, provider: 'local' }
        });

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login Endpoint
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find by username or email
        const user = await prisma.user.findFirst({ 
            where: { 
                OR: [
                    { username: username },
                    { email: username.toLowerCase().trim() }
                ]
            } 
        });
        
        if (!user || !user.passwordHash) {
            // Generic error message for security
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Forgot Password Endpoint
router.post('/forgot-password', authLimiter, async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const normalizedEmail = email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        
        if (!user) {
            // Don't leak user existence
            return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

        await prisma.user.update({
            where: { id: user.id },
            data: { resetToken, resetTokenExpiry }
        });

        // In a real app, send email here. For now, we return it in the response for dev purposes.
        res.json({ success: true, message: 'If the email exists, a reset link has been sent.', devToken: resetToken });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reset Password Endpoint
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (!isValidPassword(newPassword)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long, contain 1 uppercase letter and 1 number.' });
        }

        const user = await prisma.user.findFirst({
            where: {
                resetToken: token,
                resetTokenExpiry: { gt: new Date() } // Token not expired
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { 
                passwordHash, 
                resetToken: null, 
                resetTokenExpiry: null 
            }
        });

        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = { authRouter: router, JWT_SECRET };
