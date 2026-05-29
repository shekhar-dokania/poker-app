const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

class ClubManager {
    constructor(io) {
        this.io = io;
    }

    generateCode() {
        return crypto.randomBytes(3).toString('hex').toUpperCase();
    }

    async createClub(user, name) {
        let code;
        let isUnique = false;
        
        while (!isUnique) {
            code = this.generateCode();
            const existing = await prisma.club.findUnique({ where: { code } });
            if (!existing) isUnique = true;
        }

        const club = await prisma.club.create({
            data: {
                name,
                code,
                ownerId: user.userId,
                members: {
                    create: {
                        userId: user.userId,
                        status: 'APPROVED',
                        role: 'OWNER'
                    }
                }
            }
        });

        return club;
    }

    async requestJoinClub(user, code) {
        const club = await prisma.club.findUnique({ where: { code } });
        if (!club) throw new Error("Club not found with this code");

        const existingMember = await prisma.clubMember.findUnique({
            where: { clubId_userId: { clubId: club.id, userId: user.userId } }
        });

        if (existingMember) {
            throw new Error(`You already have a request or membership with status: ${existingMember.status}`);
        }

        await prisma.clubMember.create({
            data: {
                clubId: club.id,
                userId: user.userId,
                status: 'PENDING',
                role: 'MEMBER'
            }
        });

        return { success: true, message: "Join request sent to club owner." };
    }

    async resolveJoinRequest(user, memberId, status) {
        // Find membership and check if user is OWNER of the club
        const membership = await prisma.clubMember.findUnique({
            where: { id: memberId },
            include: { club: true }
        });

        if (!membership) throw new Error("Membership request not found");
        if (membership.club.ownerId !== user.userId) {
            throw new Error("You are not the owner of this club");
        }

        if (status !== 'APPROVED' && status !== 'REJECTED') {
            throw new Error("Invalid status");
        }

        await prisma.clubMember.update({
            where: { id: memberId },
            data: { status }
        });

        return { success: true };
    }

    async removeClubMember(user, memberId) {
        // Find membership and check if user is OWNER of the club
        const membership = await prisma.clubMember.findUnique({
            where: { id: memberId },
            include: { club: true }
        });

        if (!membership) throw new Error("Membership not found");
        if (membership.club.ownerId !== user.userId) {
            throw new Error("You are not the owner of this club");
        }
        if (membership.userId === user.userId) {
            throw new Error("You cannot remove yourself");
        }

        await prisma.clubMember.delete({
            where: { id: memberId }
        });

        return { success: true };
    }

    async getUserClubs(userId) {
        const memberships = await prisma.clubMember.findMany({
            where: { userId, status: 'APPROVED' },
            include: {
                club: {
                    include: {
                        _count: {
                            select: { members: { where: { status: 'APPROVED' } } }
                        }
                    }
                }
            }
        });

        return memberships.map(m => ({
            id: m.club.id,
            name: m.club.name,
            code: m.club.code,
            ownerId: m.club.ownerId,
            memberCount: m.club._count.members,
            role: m.role
        }));
    }

    async getClubDetails(userId, clubId) {
        // Verify user is approved member
        const membership = await prisma.clubMember.findUnique({
            where: { clubId_userId: { clubId, userId } }
        });

        if (!membership || membership.status !== 'APPROVED') {
            throw new Error("You are not an approved member of this club");
        }

        const club = await prisma.club.findUnique({
            where: { id: clubId },
            include: {
                members: {
                    include: { user: { select: { username: true } } },
                    orderBy: { joinedAt: 'asc' }
                },
                games: {
                    include: {
                        host: { select: { username: true } },
                        ledger: {
                            include: { user: { select: { username: true } } }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        if (!club) throw new Error("Club not found");

        const activeGames = club.games.filter(g => g.status === 'active').map(g => ({
            sessionId: g.id,
            roomCode: g.roomCode,
            host: g.host.username,
            settings: g.settings,
            createdAt: g.createdAt
        }));

        const pastGames = club.games.filter(g => g.status === 'ended').map(g => ({
            sessionId: g.id,
            roomCode: g.roomCode,
            host: g.host.username,
            settings: g.settings,
            createdAt: g.createdAt,
            endedAt: g.endedAt,
            ledger: g.ledger.map(l => ({
                userId: l.userId,
                username: l.user.username,
                totalBuyIn: l.totalBuyIn,
                finalChips: l.finalChips,
                netProfit: l.netProfit
            }))
        }));

        // Compute Club Leaderboard from past games ledger
        const leaderboardMap = {};
        club.games.filter(g => g.status === 'ended').forEach(game => {
            game.ledger.forEach(entry => {
                const username = entry.user.username;
                if (!leaderboardMap[username]) {
                    leaderboardMap[username] = { username, netProfit: 0, gamesPlayed: 0 };
                }
                leaderboardMap[username].netProfit += entry.netProfit;
                leaderboardMap[username].gamesPlayed += 1;
            });
        });

        const leaderboard = Object.values(leaderboardMap).sort((a, b) => b.netProfit - a.netProfit);

        const pendingRequests = club.ownerId === userId 
            ? club.members.filter(m => m.status === 'PENDING').map(m => ({
                id: m.id,
                username: m.user.username,
                joinedAt: m.joinedAt
            }))
            : [];

        const approvedMembers = club.members.filter(m => m.status === 'APPROVED').map(m => ({
            id: m.id,
            username: m.user.username,
            role: m.role
        }));

        return {
            id: club.id,
            name: club.name,
            code: club.code,
            isOwner: club.ownerId === userId,
            activeGames,
            pastGames,
            leaderboard,
            approvedMembers,
            pendingRequests
        };
    }
}

module.exports = ClubManager;
