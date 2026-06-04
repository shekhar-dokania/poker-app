const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const jwksClient = require('jwks-rsa');

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

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

// Me Endpoint
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar, coins: user.coins, lastFreeClaim: user.lastFreeClaim } });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Buy Coins Mock Endpoint
router.post('/buy-coins', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.body;
        // Mock purchase mapping
        let amount = 100;
        if (productId === 'com.mayhempoker.coins.500') amount = 500;
        if (productId === 'com.mayhempoker.coins.1000') amount = 1000;

        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: { coins: { increment: amount } }
        });
        
        res.json({ success: true, coins: user.coins });
    } catch (error) {
        console.error("Buy Coins Error:", error);
        res.status(500).json({ error: 'Failed to purchase coins' });
    }
});

// Claim Free Coins Endpoint
router.post('/claim-free-coins', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const now = new Date();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        if (user.lastFreeClaim && (now.getTime() - user.lastFreeClaim.getTime() < ONE_DAY)) {
            return res.status(400).json({ error: 'You have already claimed your free coins today.' });
        }
        
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                coins: user.coins + 10,
                lastFreeClaim: now
            }
        });
        
        res.json({ success: true, coins: updatedUser.coins, lastFreeClaim: updatedUser.lastFreeClaim });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mock Buy Coins Endpoint
router.post('/buy-coins-mock', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { coins: user.coins + 100 }
        });
        
        res.json({ success: true, coins: updatedUser.coins });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Avatar Update Endpoint
router.post('/avatar', authenticateToken, async (req, res) => {
    try {
        const { avatar } = req.body;
        if (!avatar) return res.status(400).json({ error: 'Avatar is required' });
        
        const updatedUser = await prisma.user.update({
            where: { id: req.user.userId },
            data: { avatar }
        });
        
        if (req.roomManager) {
            await req.roomManager.updateUserProfile(req.user.userId, { avatar });
        }
        
        res.json({ success: true, user: { id: updatedUser.id, username: updatedUser.username, avatar: updatedUser.avatar } });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Username Update Endpoint
router.post('/username', authenticateToken, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.trim() === '') {
            return res.status(400).json({ error: 'Username cannot be empty' });
        }
        
        const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
        if (existing && existing.id !== req.user.userId) {
             return res.status(400).json({ error: 'Username already taken' });
        }

        const updatedUser = await prisma.user.update({
            where: { id: req.user.userId },
            data: { username: username.trim() }
        });
        
        if (req.roomManager) {
            await req.roomManager.updateUserProfile(req.user.userId, { name: username.trim() });
        }
        res.json({ success: true, user: { id: updatedUser.id, username: updatedUser.username, avatar: updatedUser.avatar } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update username' });
    }
});

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
        res.json({ success: true, token, user: { id: user.id, username: user.username, avatar: user.avatar } });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login Endpoint
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Find by email
        const user = await prisma.user.findFirst({ 
            where: { 
                email: email.toLowerCase().trim()
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
        res.json({ success: true, token, user: { id: user.id, username: user.username, avatar: user.avatar } });
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

// Apple Sign-In Endpoint
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys'
});

function getAppleSigningKey(header, callback) {
  appleJwksClient.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err, null);
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

router.post('/apple', authLimiter, async (req, res) => {
    try {
        const { identityToken, fullName } = req.body;
        if (!identityToken) return res.status(400).json({ error: 'identityToken required' });
        
        jwt.verify(identityToken, getAppleSigningKey, {
            algorithms: ['RS256'],
            issuer: 'https://appleid.apple.com'
        }, async (err, decoded) => {
            if (err) return res.status(401).json({ error: 'Invalid Apple token' });
            
            const email = decoded.email;
            if (!email) return res.status(400).json({ error: 'No email provided by Apple' });
            
            const normalizedEmail = email.toLowerCase().trim();
            let user = await prisma.user.findFirst({ where: { email: normalizedEmail } });
            
            if (!user) {
                // Determine username from fullName or prefix of email
                let baseUsername = fullName || normalizedEmail.split('@')[0];
                baseUsername = baseUsername.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
                if (baseUsername.length < 3) baseUsername = 'player' + baseUsername;
                
                let username = baseUsername;
                let counter = 1;
                while (await prisma.user.findFirst({ where: { username } })) {
                    username = `${baseUsername}${counter}`;
                    counter++;
                }
                
                const randomPassword = crypto.randomBytes(16).toString('hex') + 'A1@';
                const passwordHash = await bcrypt.hash(randomPassword, 10);
                
                user = await prisma.user.create({
                    data: {
                        username,
                        email: normalizedEmail,
                        passwordHash,
                        provider: 'apple'
                    }
                });
            } else if (user.provider !== 'apple' && user.provider !== 'local') {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { provider: 'apple' }
                });
            }
            
            const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ success: true, token, user: { id: user.id, username: user.username, avatar: user.avatar } });
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = { authRouter: router, JWT_SECRET };
