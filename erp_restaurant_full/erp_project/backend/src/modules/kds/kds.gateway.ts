import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';

export const KDS_CHANGED = 'kds.changed';
export interface KdsChangedEvent {
  branchId: number;
}

/**
 * Real-time Kitchen Display sync. Clients join their branch room and receive a
 * lightweight `kds_update` ping whenever an order/item changes, so the board
 * refetches instantly instead of polling. Falls back to polling client-side if
 * the socket can't connect (e.g. proxy not configured).
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: 'kds', path: '/socket.io' })
export class KdsGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('join_branch')
  joinBranch(@ConnectedSocket() client: Socket, @MessageBody() data: { branchId: number }) {
    if (data?.branchId != null) client.join(`branch_${data.branchId}`);
    return { joined: data?.branchId };
  }

  @OnEvent(KDS_CHANGED)
  onKdsChanged(evt: KdsChangedEvent) {
    if (!this.server || evt?.branchId == null) return;
    this.server.to(`branch_${evt.branchId}`).emit('kds_update', { branchId: evt.branchId, at: Date.now() });
  }
}
