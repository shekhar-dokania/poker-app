const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretpokerkey';

// Register Endpoint
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { username, passwordHash }
        });

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login Endpoint
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user.id, username: user.username } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = { authRouter: router, JWT_SECRET };
