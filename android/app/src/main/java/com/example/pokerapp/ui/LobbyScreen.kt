package com.example.pokerapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.pokerapp.MainActivity
import com.example.pokerapp.data.PokerSocketManager
import com.example.pokerapp.data.StoreManager

@Composable
fun LobbyScreen(onNavigateToTable: () -> Unit) {
    val context = LocalContext.current
    val storeManager = remember { StoreManager(context) }

    var username by remember { mutableStateOf("") }
    var roomCode by remember { mutableStateOf("") }

    val isConnected by PokerSocketManager.isConnected.collectAsState()
    val myCoins by PokerSocketManager.myCoins.collectAsState()
    val currentRoom by PokerSocketManager.currentRoom.collectAsState()

    LaunchedEffect(currentRoom) {
        if (currentRoom != null) {
            onNavigateToTable()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Poker App Lobby", style = MaterialTheme.typography.headlineLarge)
        Spacer(modifier = Modifier.height(16.dp))

        if (isConnected) {
            Text("Connected to Server \uD83D\uDFE2", color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(8.dp))
            Text("Your Coins: $myCoins")
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = {
                val product = storeManager.products.value.firstOrNull { it.productId == "com.mayhempoker.coins.100" }
                if (product != null) {
                    storeManager.purchaseProduct(context as MainActivity, product)
                }
            }) {
                Text("Buy 100 Coins")
            }
        } else {
            Text("Disconnected \uD83D\uDD34", color = MaterialTheme.colorScheme.error)
            Button(onClick = { PokerSocketManager.connectWithToken("android-token") }) {
                Text("Connect")
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = roomCode,
            onValueChange = { roomCode = it },
            label = { Text("Room Code") },
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = { PokerSocketManager.joinRoom(roomCode, username) },
            enabled = isConnected && username.isNotBlank() && roomCode.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Join Table")
        }
    }
}
