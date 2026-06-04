package com.example.pokerapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.pokerapp.data.PokerSocketManager

@Composable
fun TableScreen(onNavigateBack: () -> Unit) {
    val roomState by PokerSocketManager.roomState.collectAsState()
    val currentRoom by PokerSocketManager.currentRoom.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (currentRoom == null) {
            Text("Left Room")
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onNavigateBack) {
                Text("Back to Lobby")
            }
        } else {
            Text("Table: $currentRoom", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
            
            Text("Room State JSON:")
            Text(roomState?.toString(2) ?: "Loading...", style = MaterialTheme.typography.bodySmall)

            Spacer(modifier = Modifier.height(32.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Button(onClick = { PokerSocketManager.sitDown(currentRoom!!, 0) }) {
                    Text("Sit Down")
                }
                Button(onClick = { PokerSocketManager.leaveRoom() }) {
                    Text("Leave Table")
                }
            }
        }
    }
}
