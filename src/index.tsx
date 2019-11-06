import React, { Component, ReactNode, CSSProperties } from 'react';
import { throttle } from 'throttle-debounce';
import { ThresholdUnits, parseThreshold } from './utils/threshold';

type Fn = () => any;
export interface Props {
  next: Fn;
  hasMore: boolean;
  children: ReactNode;
  loader: ReactNode;
  scrollThreshold?: number | string;
  endMessage?: ReactNode;
  style?: CSSProperties;
  height?: number;
  scrollableTarget?: ReactNode;
  hasChildren?: boolean;
  pullDownToRefresh?: boolean;
  pullDownToRefreshContent?: ReactNode;
  releaseToRefreshContent?: ReactNode;
  pullDownToRefreshThreshold?: number;
  refreshFunction?: Fn;
  onScroll?: (e: MouseEvent) => any;
  dataLength: number;
  initialScrollY?: number;
  key?: string;
  className?: string;
}

interface State {
  showLoader: boolean;
  pullToRefreshThresholdBreached: boolean;
}

export default class InfiniteScroll extends Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      showLoader: false,
      pullToRefreshThresholdBreached: false,
    };

    this.throttledOnScrollListener = throttle(150, this.onScrollListener).bind(
      this
    );
    this.onStart = this.onStart.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onEnd = this.onEnd.bind(this);
  }

  private throttledOnScrollListener: (e: MouseEvent) => void;
  private _scrollableNode: HTMLElement | undefined | null;
  private el: HTMLElement | undefined | Window & typeof globalThis;
  private _infScroll: HTMLDivElement | undefined;
  private lastScrollTop = 0;
  private actionTriggered = false;
  private _pullDown: HTMLDivElement | undefined;

  // variables to keep track of pull down behaviour
  private startY = 0;
  private currentY = 0;
  private dragging = false;

  // will be populated in componentDidMount
  // based on the height of the pull down element
  private maxPullDownDistance = 0;

  componentDidMount() {
    this._scrollableNode = this.getScrollableTarget();
    this.el = this.props.height
      ? this._infScroll
      : this._scrollableNode || window;

    if (this.el) {
      this.el.addEventListener('scroll', e =>
        this.throttledOnScrollListener(e as MouseEvent)
      );
    }

    if (
      typeof this.props.initialScrollY === 'number' &&
      this.el &&
      this.el instanceof HTMLElement &&
      this.el.scrollHeight > this.props.initialScrollY
    ) {
      this.el.scrollTo(0, this.props.initialScrollY);
    }

    if (this.props.pullDownToRefresh && this.el) {
      this.el.addEventListener('touchstart', this.onStart);
      this.el.addEventListener('touchmove', this.onMove);
      this.el.addEventListener('touchend', this.onEnd);

      this.el.addEventListener('mousedown', this.onStart);
      this.el.addEventListener('mousemove', this.onMove);
      this.el.addEventListener('mouseup', this.onEnd);

      // get BCR of pullDown element to position it above
      this.maxPullDownDistance =
        (this._pullDown &&
          this._pullDown.firstChild &&
          (this._pullDown.firstChild as HTMLDivElement).getBoundingClientRect()
            .height) ||
        0;
      this.forceUpdate();

      if (typeof this.props.refreshFunction !== 'function') {
        throw new Error(
          `Mandatory prop "refreshFunction" missing.
          Pull Down To Refresh functionality will not work
          as expected. Check README.md for usage'`
        );
      }
    }
  }

  componentWillUnmount() {
    if (this.el) {
      this.el.removeEventListener('scroll', e =>
        this.throttledOnScrollListener(e as MouseEvent)
      );

      if (this.props.pullDownToRefresh) {
        this.el.removeEventListener('touchstart', this.onStart);
        this.el.removeEventListener('touchmove', this.onMove);
        this.el.removeEventListener('touchend', this.onEnd);

        this.el.removeEventListener('mousedown', this.onStart);
        this.el.removeEventListener('mousemove', this.onMove);
        this.el.removeEventListener('mouseup', this.onEnd);
      }
    }
  }

  UNSAFE_componentWillReceiveProps(props: Props) {
    // do nothing when dataLength and key are unchanged
    if (
      this.props.key === props.key &&
      this.props.dataLength === props.dataLength
    )
      return;

    this.actionTriggered = false;
    // update state when new data was sent in
    this.setState({
      showLoader: false,
      pullToRefreshThresholdBreached: false,
    });
  }

  getScrollableTarget = () => {
    if (this.props.scrollableTarget instanceof HTMLElement)
      return this.props.scrollableTarget;
    if (typeof this.props.scrollableTarget === 'string') {
      return document.getElementById(this.props.scrollableTarget);
    }
    if (this.props.scrollableTarget === null) {
      console.warn(`You are trying to pass scrollableTarget but it is null. This might
        happen because the element may not have been added to DOM yet.
        See https://github.com/ankeetmaini/react-infinite-scroll-component/issues/59 for more info.
      `);
    }
    return null;
  };

  onStart: EventListener = (evt: Event) => {
    if (this.lastScrollTop) return;

    this.dragging = true;

    if (evt instanceof MouseEvent) {
      this.startY = evt.pageY;
    } else if (evt instanceof TouchEvent) {
      this.startY = evt.touches[0].pageY;
    }
    this.currentY = this.startY;

    if (this._infScroll) {
      this._infScroll.style.willChange = 'transform';
      this._infScroll.style.transition = `transform 0.2s cubic-bezier(0,0,0.31,1)`;
    }
  };

  onMove: EventListener = (evt: Event) => {
    if (!this.dragging) return;

    if (evt instanceof MouseEvent) {
      this.currentY = evt.pageY;
    } else if (evt instanceof TouchEvent) {
      this.currentY = evt.touches[0].pageY;
    }

    // user is scrolling down to up
    if (this.currentY < this.startY) return;

    if (
      this.currentY - this.startY >=
      Number(this.props.pullDownToRefreshThreshold)
    ) {
      this.setState({
        pullToRefreshThresholdBreached: true,
      });
    }

    // so you can drag upto 1.5 times of the maxPullDownDistance
    if (this.currentY - this.startY > this.maxPullDownDistance * 1.5) return;

    if (this._infScroll) {
      this._infScroll.style.overflow = 'visible';
      this._infScroll.style.transform = `translate3d(0px, ${this.currentY -
        this.startY}px, 0px)`;
    }
  };

  onEnd: EventListener = () => {
    this.startY = 0;
    this.currentY = 0;

    this.dragging = false;

    if (this.state.pullToRefreshThresholdBreached) {
      this.props.refreshFunction && this.props.refreshFunction();
    }

    requestAnimationFrame(() => {
      // this._infScroll
      if (this._infScroll) {
        this._infScroll.style.overflow = 'auto';
        this._infScroll.style.transform = 'none';
        this._infScroll.style.willChange = 'none';
      }
    });
  };

  isElementAtBottom(
    target: HTMLElement,
    scrollThreshold: string | number = 0.8
  ) {
    const clientHeight =
      target === document.body || target === document.documentElement
        ? window.screen.availHeight
        : target.clientHeight;

    const threshold = parseThreshold(scrollThreshold);

    if (threshold.unit === ThresholdUnits.Pixel) {
      return (
        target.scrollTop + clientHeight >= target.scrollHeight - threshold.value
      );
    }

    return (
      target.scrollTop + clientHeight >=
      (threshold.value / 100) * target.scrollHeight
    );
  }

  onScrollListener = (event: MouseEvent) => {
    if (typeof this.props.onScroll === 'function') {
      // Execute this callback in next tick so that it does not affect the
      // functionality of the library.
      setTimeout(() => this.props.onScroll && this.props.onScroll(event), 0);
    }

    const target =
      this.props.height || this._scrollableNode
        ? (event.target as HTMLElement)
        : document.documentElement.scrollTop
        ? document.documentElement
        : document.body;

    // return immediately if the action has already been triggered,
    // prevents multiple triggers.
    if (this.actionTriggered) return;

    const atBottom = this.isElementAtBottom(target, this.props.scrollThreshold);

    // call the `next` function in the props to trigger the next data fetch
    if (atBottom && this.props.hasMore) {
      this.actionTriggered = true;
      this.setState({ showLoader: true });
      this.props.next && this.props.next();
    }

    this.lastScrollTop = target.scrollTop;
  };

  render() {
    const style = {
      height: this.props.height || 'auto',
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
      ...this.props.style,
    } as CSSProperties;
    const hasChildren =
      this.props.hasChildren ||
      !!(
        this.props.children &&
        this.props.children instanceof Array &&
        this.props.children.length
      );

    // because heighted infiniteScroll visualy breaks
    // on drag down as overflow becomes visible
    const outerDivStyle =
      this.props.pullDownToRefresh && this.props.height
        ? { overflow: 'auto' }
        : {};
    return (
      <div
        style={outerDivStyle}
        className="infinite-scroll-component__outerdiv"
      >
        <div
          className={`infinite-scroll-component ${this.props.className || ''}`}
          ref={(infScroll: HTMLDivElement) => (this._infScroll = infScroll)}
          style={style}
        >
          {this.props.pullDownToRefresh && (
            <div
              style={{ position: 'relative' }}
              ref={(pullDown: HTMLDivElement) => (this._pullDown = pullDown)}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: -1 * this.maxPullDownDistance,
                }}
              >
                {this.state.pullToRefreshThresholdBreached
                  ? this.props.releaseToRefreshContent
                  : this.props.pullDownToRefreshContent}
              </div>
            </div>
          )}
          {this.props.children}
          {!this.state.showLoader &&
            !hasChildren &&
            this.props.hasMore &&
            this.props.loader}
          {this.state.showLoader && this.props.hasMore && this.props.loader}
          {!this.props.hasMore && this.props.endMessage}
        </div>
      </div>
    );
  }
}
